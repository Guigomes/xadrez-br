'use client';

import Link from 'next/link';
import { useTournament, useRoundSections } from '@/lib/hooks/use-tournament';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS } from '@/lib/utils/chess';
import { RoundDetailClient } from '@/components/tournament/round-detail-client';

/**
 * Conteúdo de UMA rodada (mesa a mesa) — client component, mesmo caso de uso
 * de rounds-list.tsx: reusado pelo público e pela visão do organizador de
 * torneio importado, que só visualiza (o pareamento vem do chess-results.com
 * via cron-import, não é editável por aqui).
 *
 * `basePath` monta os links de navegação (anterior/próxima rodada, filtro de
 * grupo) — `/tournaments/{slug}/rounds` no público, `/admin/tournaments/
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
  const { data: tournament, isLoading: loadingTournament } = useTournament(slug);
  const rn = parseInt(roundNumber);
  const { data: sections, isLoading: loadingSections } = useRoundSections(tournament?.id ?? '', rn);

  if (loadingTournament || (!!tournament && loadingSections)) return <PageSpinner />;
  if (!tournament) return <p className="text-sm text-gray-500 dark:text-gray-400">Torneio não encontrado.</p>;
  if (!Number.isFinite(rn) || rn < 1 || !sections) {
    return <EmptyState icon="📋" title="Rodada não encontrada" description="Essa rodada não existe (ainda) neste torneio." />;
  }

  const headerStatus = aggregateStatus(sections.map((s) => s.status));
  const isMultiGroup = sections.length > 1 || sections.some((s) => s.groupName);

  // Pick which group's pairings to render. ?group=<id> wins when it matches a
  // known group; otherwise default to the first group so users don't get a
  // wall of every section by default (most follow only one or two groups).
  const selectedGroupId = isMultiGroup
    ? (groupParam && sections.some((s) => s.groupId === groupParam)
        ? groupParam
        : sections[0]?.groupId ?? null)
    : null;

  const visibleSections = isMultiGroup
    ? sections.filter((s) => s.groupId === selectedGroupId)
    : sections;

  // Preserved query string for prev/next nav so the chosen group sticks.
  const qs = selectedGroupId ? `?group=${selectedGroupId}` : '';

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

      {/* Group filter pills — same UX as the standings tab. */}
      {isMultiGroup && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {sections.map((s) => (
            <Link
              key={s.groupId}
              href={`${basePath}/${rn}?group=${s.groupId}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                s.groupId === selectedGroupId
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {s.groupName}
            </Link>
          ))}
        </div>
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
