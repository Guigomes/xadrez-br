'use client';

import { useMemo } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTournament, useRoundSections } from '@/lib/hooks/use-tournament';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS } from '@/lib/utils/chess';
import { RoundDetailClient } from '@/components/tournament/round-detail-client';
import { useTournamentGroupPreference } from '@/lib/hooks/use-tournament-group-preference';

/**
 * Conteúdo de UMA rodada (mesa a mesa) — client component, mesmo caso de uso
 * de rounds-list.tsx: reusado pelo público e pela visão do organizador de
 * torneio importado, que só visualiza (o pareamento vem do chess-results.com
 * via cron-import, não é editável por aqui).
 *
 * `basePath` monta os links de navegação (anterior/próxima rodada, filtro de
 * grupo) — `/torneios/{slug}/rounds` no público, `/admin/tournaments/
 * {slug}/rounds` no admin.
 */
function aggregateStatus(statuses: string[]): 'draft' | 'pending' | 'ongoing' | 'finished' {
  if (statuses.length === 0) return 'pending';
  if (statuses.every((s) => s === 'finished')) return 'finished';
  if (statuses.some((s) => s === 'ongoing')) return 'ongoing';
  return 'pending';
}

export function RoundDetailView({
  slug, roundNumber, groupParam, basePath,
}: {
  slug: string;
  roundNumber: string;
  groupParam?: string;
  basePath: string;
}) {
  const router = useRouter();
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const rn = parseInt(roundNumber);
  const { data: sections, isLoading: loadingSections } = useRoundSections(tournament?.id ?? '', rn);
  const groupIds = useMemo(
    () => [...new Set((sections ?? []).map((section) => section.groupId).filter((id): id is string => Boolean(id)))],
    [sections],
  );
  const { selectedGroupId, rememberGroup } = useTournamentGroupPreference(slug, groupParam, groupIds);

  if (loadingTournament || (!!tournament && loadingSections)) return <PageSpinner />;
  if (!tournament) return <p className="text-sm text-gray-500 dark:text-gray-400">Torneio não encontrado.</p>;
  if (!Number.isFinite(rn) || rn < 1 || !sections) {
    return <EmptyState icon="📋" title="Rodada não encontrada" description="Essa rodada não existe (ainda) neste torneio." />;
  }

  const headerStatus = aggregateStatus(sections.map((s) => s.status));
  const isMultiGroup = sections.length > 1 || sections.some((s) => s.groupName);

  const visibleSections = isMultiGroup
    ? sections.filter((s) => s.groupId === selectedGroupId)
    : sections;

  // Preserved query string for prev/next nav so the chosen group sticks.
  const qs = selectedGroupId ? `?group=${selectedGroupId}` : '';

  function selectGroup(groupId: string) {
    rememberGroup(groupId);
    router.replace(`${basePath}/${rn}?group=${encodeURIComponent(groupId)}`, { scroll: false });
  }

  return (
    <div>
      {/* Round header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${ROUND_STATUS_COLORS[headerStatus]}`}>
            {rn}
          </span>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Rodada {rn}</h2>
            <Badge className={ROUND_STATUS_COLORS[headerStatus]}>
              {headerStatus === 'ongoing' && (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {ROUND_STATUS_LABELS[headerStatus]}
            </Badge>
          </div>
        </div>

        {/* Previous / Next navigation — preserves the selected group */}
        <div className="flex gap-2">
          {rn > 1 && (
            <Link
              href={`${basePath}/${rn - 1}${qs}`}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Rodada {rn - 1}
            </Link>
          )}
          {rn < tournament.rounds_count && (
            <Link
              href={`${basePath}/${rn + 1}${qs}`}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Rodada {rn + 1}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Group selector — same UX as the standings tab. */}
      {isMultiGroup && (
        <label className="mb-4 block min-w-48 max-w-xs text-left">
          <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Grupo</span>
          <select
            value={selectedGroupId ?? ''}
            onChange={(event) => selectGroup(event.target.value)}
            className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            {sections.map((section) => (
              <option key={section.groupId} value={section.groupId ?? ''}>{section.groupName}</option>
            ))}
          </select>
        </label>
      )}

      {/* Pairings for the selected group (or the single section for
          single-group tournaments). RoundDetailClient handles its own
          auto-refresh while the round is ongoing. */}
      <div className="space-y-4">
        {visibleSections.map((s) => (
          <div key={s.roundId} className="card p-4">
            {isMultiGroup && s.groupName && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{s.groupName}</h3>
                <Badge className={ROUND_STATUS_COLORS[s.status]}>
                  {s.status === 'ongoing' && (
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                  {ROUND_STATUS_LABELS[s.status]}
                </Badge>
              </div>
            )}
            <RoundDetailClient
              roundId={s.roundId}
              tournamentId={tournament.id}
              tournamentSlug={slug}
              isOngoing={s.status === 'ongoing'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
