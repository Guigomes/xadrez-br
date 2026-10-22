import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError } from '@/lib/lite/server';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** O dono do torneio (celular do organizador): resultados dos árbitros ainda não aplicados. */
async function owner(request: Request, id: string) {
  const user = await getBearerUser(request);
  if (!user) return { error: liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.') };
  const admin = createAdminClient();
  const { data } = await admin.from('lite_tournaments').select('owner_id, device_id').eq('id', id).maybeSingle();
  if (!data || data.owner_id !== user.id) return { error: liteError(404, 'NOT_FOUND', 'Torneio não encontrado na sua conta.') };
  return { admin, deviceId: data.device_id as string };
}

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await owner(request, id);
  if ('error' in ctx) return ctx.error;
  // Só o aparelho que edita o torneio aplica (o outro receberia e não poderia enviar o backup).
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (deviceId && deviceId !== ctx.deviceId) return NextResponse.json({ submissions: [], locked: true });

  const { data, error } = await ctx.admin
    .from('lite_result_submissions')
    .select('game_id, rev, result, arbiter_name, round_number, board, updated_at')
    .eq('tournament_id', id)
    .eq('status', 'pending')
    .order('updated_at');
  if (error) return liteError(500, 'LIST_FAILED', 'Não foi possível buscar os resultados.');
  return NextResponse.json({
    submissions: (data ?? []).map((s) => ({
      gameId: s.game_id,
      rev: s.rev,
      result: s.result,
      arbiterName: s.arbiter_name,
      round: s.round_number,
      board: s.board,
      at: s.updated_at,
    })),
  });
}

/** Confirma o que o aparelho fez com cada resultado: aplicado ou recusado (com o motivo). */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await owner(request, id);
  if ('error' in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { acks?: unknown } | null;
  const acks = Array.isArray(body?.acks) ? body.acks.slice(0, 500) : [];

  let done = 0;
  for (const a of acks as Array<{ gameId?: unknown; rev?: unknown; status?: unknown; message?: unknown }>) {
    if (typeof a.gameId !== 'string' || typeof a.rev !== 'string') continue;
    if (a.status !== 'applied' && a.status !== 'rejected') continue;
    // Só a versão que o aparelho viu: se o árbitro reenviou nesse meio tempo, fica pendente.
    const { data } = await ctx.admin
      .from('lite_result_submissions')
      .update({
        status: a.status,
        message: typeof a.message === 'string' ? a.message.slice(0, 300) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', id)
      .eq('game_id', a.gameId)
      .eq('rev', a.rev)
      .select('game_id');
    done += data?.length ?? 0;
  }
  return NextResponse.json({ ok: true, updated: done });
}
