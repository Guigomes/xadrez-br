'use client';

import { use, useState } from 'react';
import { useTournament, useTournamentStandings, useTournamentRounds } from '@/lib/hooks/use-tournament';
import { useFollowedInTournament } from '@/lib/hooks/use-auth';
import { StandingsTable } from '@/components/tournament/standings-table';
import { TiebreakLegendButton } from '@/components/tournament/tiebreak-legend-button';
import { AdBanner } from '@/components/ui/ad-banner';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function StandingsPage({ params }: Props) {
  const { slug } = use(params);
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const { data: standings, isLoading: loadingStandings } = useTournamentStandings(
    tournament?.id ?? ''
  );
  const { data: rounds } = useTournamentRounds(tournament?.id ?? '');
  const { data: followed } = useFollowedInTournament(tournament?.id ?? '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const isLoading = loadingTournament || (!!tournament && loadingStandings);

  if (isLoading) return <PageSpinner />;

  if (!standings?.length) {
    return (
      <EmptyState
        icon="📊"
        title="Classificação não disponível"
        description="A classificação será publicada após a conclusão das rodadas."
      />
    );
  }

  // Collect unique categories preserving order of first appearance
  const categories = Array.from(
    new Set(standings.map((r) => r.category_name).filter(Boolean) as string[])
  );
  const hasCategories = categories.length > 1;

  // Filter and re-rank within category when a category is selected
  const displayed =
    selectedCategory === 'all'
      ? standings
      : standings
          .filter((r) => r.category_name === selectedCategory)
          .map((r, i) => ({ ...r, rank: (i + 1) as number }));

  const isOngoing = tournament?.status === 'ongoing';

  // Most recent round with any status
  const latestRound = rounds?.length
    ? rounds.reduce((a, b) => (b.round_number > a.round_number ? b : a))
    : null;

  const roundStatusLabel: Record<string, { label: string; className: string }> = {
    pending:  { label: 'Aguardando',  className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    ongoing:  { label: 'Em andamento', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
    finished: { label: 'Encerrada',   className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  };

  return (
    <div>
      {isOngoing && (
        <p className="text-xs text-green-600 dark:text-green-400 mb-4 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Classificação atualizada automaticamente a cada 30 segundos
        </p>
      )}

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  {selectedCategory === 'all' ? 'Classificação geral' : selectedCategory}
                  {' · '}
                  {displayed.length} jogador{displayed.length !== 1 ? 'es' : ''}
                </h2>
                {latestRound && (() => {
                  const s = roundStatusLabel[latestRound.status] ?? roundStatusLabel.pending;
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                      Rodada {latestRound.round_number} · {s.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5">
                Critérios de desempate: Buchholz · BH Corte 1 · Sonneborn-Berger
                <TiebreakLegendButton />
              </p>
            </div>

            {hasCategories && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  Geral
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <StandingsTable standings={displayed} tournamentSlug={slug} followedPlayerIds={followed?.playerIds} />
      </div>
      <AdBanner slot="1234567890" format="horizontal" className="h-16 mt-2" />
    </div>
  );
}
