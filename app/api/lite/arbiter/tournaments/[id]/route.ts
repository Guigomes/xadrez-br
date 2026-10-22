import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError } from '@/lib/lite/server';
import { ARBITER_RESULTS, arbiterView, canSubmit, normalizeEmail, type ArbiterBackup } from '@/lib/lite/arbiter';

interface Ctx {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(request: Request, id: string) {
  const user = await getBearerUser(request);
  if (!user?.email) return { error: liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.') };
  if (!UUID.test(id)) return { error: liteError(404, 'NOT_FOUND', 'Torneio não encontrado.') };
  const email = normalizeEmail(user.email);
  const admin = createAdminClient();
  const { data } = await admin.from('lite_tournaments').select('backup').eq('id', id).maybeSingle();
  const view = data ? arbiterView(data.backup as unknown as ArbiterBackup, email) : null;
  if (!view) return { error: liteError(403, 'NOT_ARBITER', 'Você não é árbitro deste torneio.') };
  return { user, email, admin, view };
}

/** Mesas do árbitro na rodada atual, com o resultado que vale e o que ele enviou. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await load(request, id);
  if ('error' in ctx) return ctx.error;
  const { admin, view } = ctx;

  const ids = view.boards.map((b) => b.gameId);
  const { data: subs } = ids.length
    ? await admin.from('lite_result_submissions').select('game_id, result, status, message, updated_at').eq('tournament_id', id).in('game_id', ids)
    : { data: [] as Array<{ game_id: string; result: string; status: string; message: string | null; updated_at: string }> };
  const byGame = new Map((subs ?? []).map((s) => [s.game_id, s]));

  return NextResponse.json({
    ...view,
    boards: view.boards.map((b) => {
      const s = byGame.get(b.gameId);
      return { ...b, submission: s ? { result: s.result, status: s.status, message: s.message, at: s.updated_at } : null };
    }),
  });
}

/** Árbitro informa o resultado de uma mesa dele. Vai para a fila; o celular do organizador aplica. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await load(request, id);
  if ('error' in ctx) return ctx.error;
  const { admin, view, user, email } = ctx;

  const body = (await request.json().catch(() => null)) as { gameId?: unknown; result?: unknown } | null;
  const gameId = typeof body?.gameId === 'string' ? body.gameId : '';
  const result = typeof body?.result === 'string' ? body.result : '';
  if (!(ARBITER_RESULTS as readonly string[]).includes(result)) return liteError(400, 'BAD_RESULT', 'Resultado inválido.');

  const check = canSubmit(view, gameId);
  if ('error' in check) return liteError(409, 'NOT_ALLOWED', check.error);

  const { error } = await admin.from('lite_result_submissions').upsert(
    {
      tournament_id: id,
      game_id: gameId,
      round_number: view.round!.number,
      board: check.board.board,
      result,
      arbiter_email: email,
      arbiter_name: view.arbiterName,
      arbiter_user_id: user.id,
      rev: crypto.randomUUID(),
      status: 'pending',
      message: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tournament_id,game_id' },
  );
  if (error) {
    console.error('[lite/arbiter] envio:', error.message);
    return liteError(500, 'SAVE_FAILED', 'Não foi possível enviar. Tente de novo.');
  }
  return NextResponse.json({ ok: true });
}
