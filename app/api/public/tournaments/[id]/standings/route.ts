import { NextResponse } from 'next/server';
import { FINISHED_CACHE_SECONDS, getFinishedStandings, isTournamentFinished } from '@/lib/data/finished-cache';

/**
 * Classificação de torneio ENCERRADO para as telas client (aba Classificação, ficha
 * do jogador). Sai do cache do servidor e também da CDN, em vez de cada navegador
 * baixar a classificação inteira direto do Supabase (ver lib/data/finished-cache.ts).
 *
 * Torneio não encerrado (ou não visível sem login) responde 404 sem cache: o
 * navegador cai na leitura normal, ao vivo, pela própria sessão.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notCached = { headers: { 'Cache-Control': 'no-store' } };

  if (!(await isTournamentFinished(id))) {
    return NextResponse.json({ error: 'not_finished' }, { status: 404, ...notCached });
  }
  const rows = await getFinishedStandings(id);
  if (!rows) return NextResponse.json({ error: 'unavailable' }, { status: 503, ...notCached });

  return NextResponse.json(rows, {
    headers: {
      'Cache-Control': `public, max-age=300, s-maxage=${FINISHED_CACHE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}
