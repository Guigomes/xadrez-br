import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { liteError } from '@/lib/lite/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O que o aparelho acompanha (lista completa, substitui a anterior): torneios do site e, em cada
 * um, os jogadores seguidos. Identificado só pelo token (o token já foi registrado em
 * /api/lite/push/register); acompanhar não exige conta.
 */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown; follows?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return liteError(400, 'BAD_TOKEN', 'Token inválido.');
  const raw = Array.isArray(body?.follows) ? body.follows.slice(0, 200) : null;
  if (!raw) return liteError(400, 'BAD_REQUEST', 'Lista inválida.');

  const follows = new Map<string, string[]>();
  for (const f of raw as Array<{ tournamentId?: unknown; playerIds?: unknown }>) {
    if (typeof f?.tournamentId !== 'string' || !UUID.test(f.tournamentId)) continue;
    const players = Array.isArray(f.playerIds) ? f.playerIds.filter((p): p is string => typeof p === 'string' && UUID.test(p)).slice(0, 100) : [];
    follows.set(f.tournamentId, [...new Set([...(follows.get(f.tournamentId) ?? []), ...players])]);
  }

  const admin = createAdminClient();
  const { data: known } = await admin.from('app_push_tokens').select('token').eq('token', token).maybeSingle();
  if (!known) return liteError(404, 'UNKNOWN_TOKEN', 'Aparelho não registrado.');

  // Só torneios que existem (FK); id errado/apagado é ignorado em vez de derrubar a lista toda.
  const ids = [...follows.keys()];
  const { data: existing } = ids.length ? await admin.from('tournaments').select('id').in('id', ids) : { data: [] as Array<{ id: string }> };
  const valid = new Set((existing ?? []).map((t) => t.id));

  await admin.from('app_push_follows').delete().eq('token', token);
  const rows = ids.filter((id) => valid.has(id)).map((id) => ({
    token,
    tournament_id: id,
    followed_player_ids: follows.get(id) ?? [],
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await admin.from('app_push_follows').insert(rows);
    if (error) {
      console.error('[lite/push/follows]', error.message);
      return liteError(500, 'SAVE_FAILED', 'Não foi possível salvar.');
    }
  }
  return NextResponse.json({ ok: true, following: rows.length });
}
