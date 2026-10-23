import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError } from '@/lib/lite/server';
import { siteUrl } from '@/lib/seo';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function owner(request: Request, id: string) {
  const user = await getBearerUser(request);
  if (!user) return { error: liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.') };
  const admin = createAdminClient();
  const { data } = await admin.from('lite_tournaments').select('owner_id, registration_open').eq('id', id).maybeSingle();
  if (!data || data.owner_id !== user.id) {
    return { error: liteError(404, 'NOT_FOUND', 'O torneio ainda não está na sua conta. Espere o primeiro envio e tente de novo.') };
  }
  return { admin, open: data.registration_open as boolean };
}

/** Celular do organizador: link, se está aberto e as inscrições pendentes. */
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await owner(request, id);
  if ('error' in ctx) return ctx.error;
  const { data, error } = await ctx.admin
    .from('lite_registrations')
    .select('id, name, birth_year, sex, club, rating, guardian_name, contact, created_at')
    .eq('tournament_id', id)
    .eq('status', 'pending')
    .order('created_at');
  if (error) return liteError(500, 'LIST_FAILED', 'Não foi possível buscar as inscrições.');
  return NextResponse.json({
    open: ctx.open,
    url: `${siteUrl()}/inscricao/${id}`,
    registrations: (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      birthYear: r.birth_year,
      sex: r.sex,
      club: r.club,
      rating: r.rating,
      guardianName: r.guardian_name,
      contact: r.contact,
      createdAt: r.created_at,
    })),
  });
}

/**
 * Abre/fecha as inscrições ({ open }) e/ou registra o que o celular fez com cada uma
 * ({ decisions: [{ id, status: 'accepted' | 'rejected' }] }). Aceitar = o app já cadastrou o jogador.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await owner(request, id);
  if ('error' in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { open?: unknown; decisions?: unknown } | null;

  if (typeof body?.open === 'boolean') {
    await ctx.admin.from('lite_tournaments').update({ registration_open: body.open }).eq('id', id);
  }
  let decided = 0;
  if (Array.isArray(body?.decisions)) {
    for (const d of body.decisions.slice(0, 500) as Array<{ id?: unknown; status?: unknown }>) {
      if (typeof d.id !== 'string' || (d.status !== 'accepted' && d.status !== 'rejected')) continue;
      const { data } = await ctx.admin
        .from('lite_registrations')
        .update({ status: d.status, decided_at: new Date().toISOString() })
        .eq('id', d.id)
        .eq('tournament_id', id)
        .eq('status', 'pending')
        .select('id');
      decided += data?.length ?? 0;
    }
  }
  return NextResponse.json({ ok: true, open: typeof body?.open === 'boolean' ? body.open : ctx.open, decided });
}
