import { RoundsList } from '@/components/tournament/rounds-list';

interface Props {
  params: Promise<{ slug: string }>;
}

/** A lista em si mora em components/tournament/rounds-list.tsx — a mesma que
 *  o organizador de torneio importado vê em /admin/tournaments/[slug]/rounds. */
export default async function RoundsPage({ params }: Props) {
  const { slug } = await params;
  return <RoundsList slug={slug} basePath={`/tournaments/${slug}/rounds`} />;
}
