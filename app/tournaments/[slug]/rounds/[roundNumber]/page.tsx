import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS } from '@/lib/utils/chess';
import { RoundDetailClient } from './round-detail-client';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string; roundNumber: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roundNumber } = await params;
  return { title: `Rodada ${roundNumber}` };
}

type RoundRow = {
  id: string;
  status: 'pending' | 'ongoing' | 'finished';
  pairing_group_id: string | null;
};

type GroupRow = { id: string; name: string; sort_order: number };

// Aggregate status across pairing groups: finished only if every group is
// finished; otherwise prefer ongoing > pending so the user sees that something
// is in motion.
function aggregateStatus(rounds: RoundRow[]): RoundRow['status'] {
  if (rounds.every((r) => r.status === 'finished')) return 'finished';
  if (rounds.some((r) => r.status === 'ongoing')) return 'ongoing';
  return 'pending';
}

export default async function RoundPage({ params }: Props) {
  const { slug, roundNumber } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, rounds_count, status, name')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  const rn = parseInt(roundNumber);
  if (!Number.isFinite(rn) || rn < 1) notFound();

  // Multi-group tournaments have one rounds row per pairing group, so fetch
  // them all — never use .single() here, it errors out with multiple matches.
  const { data: roundsRaw } = await supabase
    .from('rounds')
    .select('id, status, pairing_group_id')
    .eq('tournament_id', tournament.id)
    .eq('round_number', rn);

  const rounds = (roundsRaw ?? []) as RoundRow[];
  if (rounds.length === 0) notFound();

  // Resolve pairing-group names so we can label each section.
  const groupIds = rounds.map((r) => r.pairing_group_id).filter((id): id is string => !!id);
  let groups: GroupRow[] = [];
  if (groupIds.length > 0) {
    const { data } = await supabase
      .from('pairing_groups')
      .select('id, name, sort_order')
      .in('id', groupIds);
    groups = (data ?? []) as GroupRow[];
  }
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  // Sort by the same age-aware order used in the overview: SUB7 < SUB9 < ...
  const sections = rounds
    .map((r) => ({
      roundId: r.id,
      status: r.status,
      groupId: r.pairing_group_id,
      groupName: r.pairing_group_id ? (groupName.get(r.pairing_group_id) ?? null) : null,
    }))
    .sort((a, b) => {
      const an = parseInt(a.groupName?.match(/\d+/)?.[0] ?? '999', 10);
      const bn = parseInt(b.groupName?.match(/\d+/)?.[0] ?? '999', 10);
      if (an !== bn) return an - bn;
      return (a.groupName ?? '').localeCompare(b.groupName ?? '');
    });

  const headerStatus = aggregateStatus(rounds);
  const isMultiGroup = sections.length > 1 || sections.some((s) => s.groupName);

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

        {/* Previous / Next navigation */}
        <div className="flex gap-2">
          {rn > 1 && (
            <Link
              href={`/tournaments/${slug}/rounds/${rn - 1}`}
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
              href={`/tournaments/${slug}/rounds/${rn + 1}`}
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

      {/* Pairings: one section per pairing group (or a single section for
          single-group tournaments). The client component handles its own
          auto-refresh while the round is ongoing. */}
      <div className="space-y-4">
        {sections.map((s) => (
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
