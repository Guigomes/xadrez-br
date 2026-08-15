import { RoundDetailView } from '@/components/tournament/round-detail-view';
import type { Metadata } from 'next';

interface Props {
  // O nome da pasta é [roundId] só porque Next.js exige o MESMO nome de
  // segmento dinâmico em todo irmão nesse nível (o painel de resultados do
  // torneio nativo já usa rounds/[roundId]/results) — pastas com nomes
  // diferentes ([roundId] e [roundNumber]) não podem coexistir. O VALOR
  // aqui é o número da rodada (1, 2, 3…), não um UUID — só o rótulo bate
  // com o vizinho por exigência do roteador.
  params: Promise<{ slug: string; roundId: string }>;
  searchParams: Promise<{ group?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roundId: roundNumber } = await params;
  return { title: `Rodada ${roundNumber}` };
}

/**
 * Rodada de torneio IMPORTADO na visão do organizador — mesmo conteúdo que o
 * público vê (components/tournament/round-detail-view.tsx). Torneio
 * importado espelha o chess-results.com via cron-import (a cada 2 min); o
 * organizador não pareia nem lança resultado por aqui, então não faz sentido
 * a visão dele ser diferente da pública. Torneio nativo não usa esta rota —
 * tem fluxo próprio em components/admin/native-rounds.tsx (e o painel de
 * resultados em rounds/[roundId]/results, que é onde o [roundId] do nome da
 * pasta realmente significa um UUID).
 */
export default async function AdminRoundPage({ params, searchParams }: Props) {
  const { slug, roundId: roundNumber } = await params;
  const { group: groupParam } = await searchParams;
  return (
    <RoundDetailView
      slug={slug}
      roundNumber={roundNumber}
      groupParam={groupParam}
      basePath={`/admin/tournaments/${slug}/rounds`}
    />
  );
}
