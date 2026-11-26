import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireCronSecret } from '@/lib/api/guards';
import { tournamentCacheTag } from '@/lib/data/finished-cache';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Limpa o cache de servidor de um torneio encerrado (lib/data/finished-cache.ts) depois de
 * uma correção feita direto no banco (nomes, categorias, cidades), sem esperar as 6 h.
 * Header `x-cron-secret` = `CRON_PUSH_SECRET`; corpo `{ "tournament_id": "<uuid>" }`.
 * A classificação servida pela CDN (/api/public/tournaments/[id]/standings) não é limpa aqui.
 */
export async function POST(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { tournament_id?: unknown } | null;
  const id = typeof body?.tournament_id === 'string' ? body.tournament_id : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'tournament_id inválido.' }, { status: 400 });
  revalidateTag(tournamentCacheTag(id));
  return NextResponse.json({ ok: true, tag: tournamentCacheTag(id) });
}
