import { RoundDetailView } from '@/components/tournament/round-detail-view';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string; roundNumber: string }>;
  searchParams: Promise<{ group?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roundNumber } = await params;
  return { title: `Rodada ${roundNumber}` };
}

/** O conteúdo em si mora em components/tournament/round-detail-view.tsx — o
 *  mesmo que a visão do organizador de torneio importado usa. */
export default async function RoundPage({ params, searchParams }: Props) {
  const { slug, roundNumber } = await params;
  const { group: groupParam } = await searchParams;
  return (
    <RoundDetailView
      slug={slug}
      roundNumber={roundNumber}
      groupParam={groupParam}
      basePath={`/tournaments/${slug}/rounds`}
    />
  );
}
