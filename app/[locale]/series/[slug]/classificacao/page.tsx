import { SeriesStandingsView } from '@/components/series/series-standings-view';
import { OfficialRankingView } from '@/components/series/official-ranking-view';
import { getSeriesHeader } from '@/lib/data/series-page-data';
import { fetchOfficialRanking, parseOfficialRankingConfig } from '@/lib/series/official-ranking';

/**
 * Série com classificação oficial do organizador (planilha publicada) mostra a
 * oficial; as demais, a calculada pelo motor de séries (migration 070).
 */
export default async function SeriesStandingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const series = await getSeriesHeader(slug);
  const official = parseOfficialRankingConfig(series?.official_ranking);
  if (official) {
    const tables = await fetchOfficialRanking(official);
    return <OfficialRankingView source={official.source} pageUrl={official.pageUrl} tables={tables} />;
  }
  return <SeriesStandingsView slug={slug} />;
}
