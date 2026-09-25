import { RoundsList } from '@/components/tournament/rounds-list';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string }>;
}

/** A lista em si mora em components/tournament/rounds-list.tsx — a mesma que
 *  o organizador de torneio importado vê em /admin/tournaments/[slug]/rounds. */
export default async function RoundsPage({ params, searchParams }: Props) {
  const [{ slug }, { group }] = await Promise.all([params, searchParams]);
  const data = await getTournamentPageData(slug);

  if (data?.currentRoundNumber) {
    const groupQuery = group ? `?group=${encodeURIComponent(group)}` : '';
    redirect(`/torneios/${slug}/rounds/${data.currentRoundNumber}${groupQuery}`);
  }

  return <RoundsList slug={slug} basePath={`/torneios/${slug}/rounds`} />;
}
