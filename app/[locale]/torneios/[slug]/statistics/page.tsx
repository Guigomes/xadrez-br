import { notFound } from 'next/navigation';
import { getSessionProfile } from '@/lib/data/session';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { getSchoolTournamentStatistics } from '@/lib/data/school-tournament-statistics';
import { SCHOOL_TOURNAMENT_SLUG } from '@/lib/statistics/school-tournament';
import { SchoolTournamentStatisticsView } from '@/components/tournament/school-tournament-statistics';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = 'force-dynamic';

export default async function TournamentStatisticsPage({ params }: Props) {
  const { slug } = await params;
  if (slug !== SCHOOL_TOURNAMENT_SLUG) notFound();

  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') notFound();

  const tournamentData = await getTournamentPageData(slug);
  if (!tournamentData) notFound();

  const statistics = await getSchoolTournamentStatistics(tournamentData.tournament.id);
  return <SchoolTournamentStatisticsView statistics={statistics} />;
}
