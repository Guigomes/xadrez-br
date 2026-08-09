'use client';

import { use, useEffect, useState } from 'react';
import { useTournament, useTournamentStandings, useTournamentRounds } from '@/lib/hooks/use-tournament';
import { useFollowedInTournament } from '@/lib/hooks/use-auth';
import { StandingsTable } from '@/components/tournament/standings-table';
import { TiebreakLegendButton } from '@/components/tournament/tiebreak-legend-button';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { compareGroupNames } from '@/lib/utils/chess';

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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const isLoading = loadingTournament || (!!tournament && loadingStandings);

  // Pairing groups present in the standings (multi-group tournament). One
  // entry per distinct pairing_group_id, ordered by name.
  const pairingGroups = (() => {
    const seen = new Map<string, string>();
    for (const r of standings ?? []) {
      if (r.pairing_group_id && r.pairing_group_name && !seen.has(r.pairing_group_id)) {
        seen.set(r.pairing_group_id, r.pairing_group_name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareGroupNames(a.name, b.name));
  })();
  const hasGroups = pairingGroups.length > 0;

  // Default to the first group once standings load. Done in an effect so the
  // selection sticks across refetches but resets if the groups list changes.
  useEffect(() => {
    if (!hasGroups) {
      if (selectedGroupId !== null) setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !pairingGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(pairingGroups[0].id);
    }
  }, [hasGroups, pairingGroups.map((g) => g.id).join('|'), selectedGroupId]);

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

  // Linhas do grupo selecionado (todas, se o torneio não separa por grupo) —
  // é dentro delas que o "Absoluto" e cada classificação (célula derivada) são
  // recortados. Grupo e classificação não são mutuamente exclusivos: toda
  // classificação vale dentro do seu grupo, e o absoluto do grupo é a aba
  // padrão — quando o torneio premia o absoluto (ver showAbsolute abaixo).
  const rowsInGroup = hasGroups
    ? (standings ?? []).filter((r) => r.pairing_group_id === selectedGroupId)
    : (standings ?? []);

  const categories = (() => {
    const seen = new Map<string, string>();
    for (const r of rowsInGroup) {
      if (r.category_id && r.category_name && !seen.has(r.category_id)) {
        seen.set(r.category_id, r.category_name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareGroupNames(a.name, b.name));
  })();
  const hasCategories = categories.length > 0;

  // Torneio que não premia o absoluto (migration 065) não mostra a aba
  // transversal — só as faixas. Exceção: grupo sem faixa nenhuma sempre mostra
  // o absoluto, senão não sobraria classificação pra ver (o organizador pode
  // ter desligado a chave e depois apagado as faixas).
  const showAbsolute = tournament?.has_absolute_classification !== false || !hasCategories;

  // selectedCategory pode ficar obsoleto ao trocar de grupo (classificação
  // de um grupo não existe no outro) — cai pro absoluto nesse caso, ou pra
  // primeira faixa quando o torneio não tem absoluto.
  const fallbackCategory = showAbsolute ? 'all' : (categories[0]?.id ?? 'all');
  const effectiveCategory = categories.some((c) => c.id === selectedCategory)
    ? selectedCategory
    : fallbackCategory;

  const displayed = effectiveCategory === 'all'
    ? rowsInGroup
    : rowsInGroup
        .filter((r) => r.category_id === effectiveCategory)
        .map((r, i) => ({ ...r, rank: (i + 1) as number }));

  const groupLabel = hasGroups ? (pairingGroups.find((g) => g.id === selectedGroupId)?.name ?? 'Grupo') : null;
  const categoryLabel = effectiveCategory === 'all'
    ? 'Absoluto'
    : (categories.find((c) => c.id === effectiveCategory)?.name ?? 'Absoluto');
  const heading = groupLabel ? `${groupLabel} · ${categoryLabel}` : categoryLabel;

  const isOngoing = tournament?.status === 'ongoing';

  // For the round status pill: with multi-group there are multiple rows per
  // round_number; pick the highest-numbered round and aggregate the status.
  type RS = 'pending' | 'ongoing' | 'finished';
  const latestRound = (() => {
    if (!rounds?.length) return null;
    const maxNumber = rounds.reduce((m, r) => Math.max(m, r.round_number), 0);
    const statuses = rounds
      .filter((r) => r.round_number === maxNumber)
      .map((r) => r.status as RS);
    const aggregate: RS = statuses.every((s) => s === 'finished')
      ? 'finished'
      : statuses.some((s) => s === 'ongoing')
        ? 'ongoing'
        : 'pending';
    return { round_number: maxNumber, status: aggregate };
  })();

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

      {tournament?.status === 'finished' && (() => {
        const first = displayed.find((r) => r.rank === 1);
        return (
          <div className="card p-4 mb-4 border-2 border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-center">
            <p className="font-semibold text-gray-900 dark:text-gray-100">🏆 Torneio encerrado!</p>
            {first && (
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">🥇 {first.full_name}</p>
            )}
          </div>
        );
      })()}

      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                  {heading}
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                Critérios de desempate: Buchholz · BH Corte 1 · Sonneborn-Berger
                <TiebreakLegendButton variant="link" />
              </p>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1.5">
              {hasGroups && (
                <div className="flex flex-wrap gap-1.5">
                  {pairingGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => { setSelectedGroupId(g.id); setSelectedCategory('all'); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        selectedGroupId === g.id
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
              {hasCategories && (
                <div className="flex flex-wrap gap-1.5">
                  {showAbsolute && (
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        effectiveCategory === 'all'
                          ? 'bg-gray-700 text-white dark:bg-gray-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      Absoluto
                    </button>
                  )}
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        effectiveCategory === cat.id
                          ? 'bg-gray-700 text-white dark:bg-gray-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <StandingsTable standings={displayed} tournamentSlug={slug} followedPlayerIds={followed?.playerIds} />
      </div>
    </div>
  );
}
