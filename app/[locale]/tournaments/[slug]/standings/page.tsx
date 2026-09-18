import { notFound } from 'next/navigation';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { StandingsView } from '@/components/tournament/standings-view';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * A tela em si mora em components/tournament/standings-view.tsx — a mesma que
 * o organizador vê em /admin/tournaments/[slug]/standings. Ela continua sendo
 * client (a classificação repola a cada 30s durante o torneio, e os filtros de
 * grupo/faixa são interativos), mas esta página passou a ser server component
 * só pra entregar o `tournamentId` já resolvido: sem ele, o componente
 * buscava o torneio e só DEPOIS a classificação — dois round-trips em fila no
 * navegador. O dado vem do cache do layout (migration 071), sem custo extra.
 */
export default async function StandingsPage({ params }: Props) {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  if (!data) notFound();

  return <StandingsView slug={slug} tournamentId={data.tournament.id} />;
}
