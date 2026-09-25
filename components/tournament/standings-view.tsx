'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTournament, useTournamentStandings, useTournamentRounds } from '@/lib/hooks/use-tournament';
import { useFollowedInTournament } from '@/lib/hooks/use-auth';
import { StandingsTable } from '@/components/tournament/standings-table';
import { TiebreakLegendButton } from '@/components/tournament/tiebreak-legend-button';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { WhatsAppButton } from '@/components/ui/whatsapp-button';
import { SearchField } from '@/components/ui/search-field';
import { compareGroupNames } from '@/lib/utils/chess';
import { summarizeRounds } from '@/lib/utils/rounds';
import { buildStandingsMessage } from '@/lib/utils/whatsapp';
import { matchesPlayerSearch } from '@/lib/utils/text';
import { useTournamentGroupPreference } from '@/lib/hooks/use-tournament-group-preference';

/**
 * Classificação do torneio — a MESMA tela para o público
 * (app/torneios/[slug]/standings) e para o organizador
 * (app/admin/tournaments/[slug]/standings). Extraído da página pública pra
 * não duplicar chips de grupo/faixa, desempates e o polling de 30s; a única
 * coisa que muda entre os dois é a moldura de layout ao redor.
 */
export function StandingsView({
  slug,
  showExport = false,
  tournamentId,
}: {
  slug: string;
  showExport?: boolean;
  /** Id vindo do servidor (a página já o tinha em mãos). Sem ele, as queries
   *  de classificação/rodadas ficavam ESPERANDO o useTournament resolver pra
   *  só então disparar — waterfall de dois round-trips no cliente. Com o id
   *  pronto, as três saem juntas no primeiro render. */
  tournamentId?: string;
}) {
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const id = tournamentId ?? tournament?.id ?? '';
  const { data: standings, isLoading: loadingStandings } = useTournamentStandings(id);
  const { data: rounds } = useTournamentRounds(id);
  const { data: followed } = useFollowedInTournament(id);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const groupFromUrl = searchParams.get('group');

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  // Com o id vindo do servidor a classificação não depende mais do
  // useTournament ter resolvido — só espera a própria query.
  const isLoading = tournamentId
    ? loadingStandings
    : loadingTournament || (!!tournament && loadingStandings);

  // Pairing groups present in the standings (multi-group tournament). One
  // entry per distinct pairing_group_id, ordered by name.
  const pairingGroups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of standings ?? []) {
      if (r.pairing_group_id && r.pairing_group_name && !seen.has(r.pairing_group_id)) {
        seen.set(r.pairing_group_id, r.pairing_group_name);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareGroupNames(a.name, b.name));
  }, [standings]);
  const pairingGroupIds = useMemo(() => pairingGroups.map((group) => group.id), [pairingGroups]);
  const hasGroups = pairingGroups.length > 0;
  const { selectedGroupId, rememberGroup } = useTournamentGroupPreference(
    slug,
    groupFromUrl,
    pairingGroupIds,
  );

  function selectGroup(groupId: string) {
    setSelectedCategory('all');
    rememberGroup(groupId);
    const params = new URLSearchParams(searchParams.toString());
    params.set('group', groupId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

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

  // A busca só filtra a TABELA — o WhatsApp e o card de campeão continuam
  // usando `displayed` cru, senão "encerrar com a busca aberta" mandaria uma
  // classificação incompleta ou perderia o vencedor de vista.
  const filteredDisplayed = displayed.filter((r) => matchesPlayerSearch(r.full_name, query));

  const groupLabel = hasGroups ? (pairingGroups.find((g) => g.id === selectedGroupId)?.name ?? 'Grupo') : null;
  const categoryLabel = effectiveCategory === 'all'
    ? 'Absoluto'
    : (categories.find((c) => c.id === effectiveCategory)?.name ?? 'Absoluto');
  const isInitialRanking = rowsInGroup.every((row) => (row.games_played ?? 0) === 0);
  const rankingLabel = isInitialRanking ? 'Ranking inicial' : categoryLabel;
  const heading = groupLabel ? `${groupLabel} · ${rankingLabel}` : rankingLabel;

  const isOngoing = tournament?.status === 'ongoing' && !isInitialRanking;

  // For the round status pill: with multi-group there are multiple rows per
  // round_number; summarizeRounds collapses them and drops drafts. The last
  // entry is the highest-numbered non-draft round.
  const summarized = summarizeRounds(rounds ?? []).rounds;
  const latest = summarized[summarized.length - 1];
  const latestRound = latest ? { round_number: latest.roundNumber, status: latest.status } : null;

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
        const podium = [
          { rank: 1, medal: '🥇' },
          { rank: 2, medal: '🥈' },
          { rank: 3, medal: '🥉' },
        ].map(({ rank, medal }) => ({ medal, row: displayed.find((r) => r.rank === rank) }))
          .filter((p) => p.row);
        return (
          <div className="card p-4 mb-4 border-2 border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-center">
            <p className="font-semibold text-gray-900 dark:text-gray-100">🏆 Classificação final</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              Todas as rodadas foram encerradas — este é o resultado definitivo.
            </p>
            {podium.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {podium.map(({ medal, row }) => (
                  <p key={row!.rank} className="text-sm text-gray-700 dark:text-gray-300">
                    {medal} {row!.title ? `${row!.title} ` : ''}{row!.full_name}
                  </p>
                ))}
              </div>
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
                {!isInitialRanking && latestRound && (() => {
                  const s = roundStatusLabel[latestRound.status] ?? roundStatusLabel.pending;
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                      Rodada {latestRound.round_number} · {s.label}
                    </span>
                  );
                })()}
              </div>
              {isInitialRanking ? (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Ordem de largada antes da primeira rodada. Pontos e desempates aparecerão após os resultados.
                </p>
              ) : (
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Critérios de desempate: Buchholz · BH Corte 1 · Sonneborn-Berger
                  <TiebreakLegendButton variant="link" />
                </p>
              )}
              {showExport && (
                <div className="mt-2">
                  <WhatsAppButton
                    getText={() =>
                      buildStandingsMessage({
                        tournamentName: tournament?.name ?? 'Torneio',
                        heading,
                        roundLabel: latestRound
                          ? `Rodada ${latestRound.round_number} · ${(roundStatusLabel[latestRound.status] ?? roundStatusLabel.pending).label}`
                          : null,
                        rows: displayed.map((r) => ({ rank: r.rank, full_name: r.full_name, points: r.points })),
                        url: typeof window !== 'undefined' ? `${window.location.origin}/torneios/${slug}/standings` : undefined,
                      })
                    }
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1.5">
              {hasGroups && (
                <label className="block min-w-48 text-left">
                  <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Grupo</span>
                  <select
                    value={selectedGroupId ?? ''}
                    onChange={(event) => selectGroup(event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  >
                    {pairingGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
              )}
              {hasCategories && (
                <div className="flex flex-wrap gap-1.5">
                  {showAbsolute && (
                    <button
                      onClick={() => setSelectedCategory('all')}
                      className={`min-h-10 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
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
                      className={`min-h-10 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
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

          <div className="mt-3">
            <SearchField value={query} onChange={setQuery} className="sm:max-w-xs" />
          </div>
        </div>

        {filteredDisplayed.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum jogador encontrado com esse nome.
          </p>
        ) : (
          <StandingsTable
            standings={filteredDisplayed}
            tournamentSlug={slug}
            followedPlayerIds={followed?.playerIds}
            isInitialRanking={isInitialRanking}
          />
        )}
      </div>
    </div>
  );
}
