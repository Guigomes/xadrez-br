import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUND_STATUS_COLORS, ROUND_STATUS_LABELS } from '@/lib/utils/chess';
import { formatDate } from '@/lib/utils/date';

interface Props {
  params: Promise<{ slug: string }>;
}

type RoundStatus = 'pending' | 'ongoing' | 'finished';

// Aggregate per pairing group: finished only if every group is finished;
// ongoing if at least one is in motion; otherwise pending.
function aggregateStatus(statuses: RoundStatus[]): RoundStatus {
  if (statuses.length === 0) return 'pending';
  if (statuses.every((s) => s === 'finished')) return 'finished';
  if (statuses.some((s) => s === 'ongoing')) return 'ongoing';
  return 'pending';
}

export default async function RoundsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, rounds_count')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  const { data: rounds } = await supabase
    .from('rounds')
    .select('round_number, status, published_at, pairing_group_id')
    .eq('tournament_id', tournament.id)
    .order('round_number');

  if (!rounds?.length) {
    return <EmptyState icon="📋" title="Nenhuma rodada criada" description="As rodadas serão publicadas pelo organizador." />;
  }

  // Group by round_number so multi-group tournaments show one card per round,
  // not one card per (round × pairing group) combination.
  const byNumber = new Map<number, { statuses: RoundStatus[]; publishedAt: string | null; groupCount: number }>();
  for (const r of rounds) {
    const n = r.round_number as number;
    const slot = byNumber.get(n) ?? { statuses: [], publishedAt: null, groupCount: 0 };
    slot.statuses.push(r.status as RoundStatus);
    slot.groupCount += 1;
    const pub = r.published_at as string | null;
    if (pub && (!slot.publishedAt || pub < slot.publishedAt)) slot.publishedAt = pub;
    byNumber.set(n, slot);
  }

  const items = Array.from(byNumber.entries())
    .map(([roundNumber, info]) => ({
      roundNumber,
      status: aggregateStatus(info.statuses),
      publishedAt: info.publishedAt,
      groupCount: info.groupCount,
    }))
    .sort((a, b) => a.roundNumber - b.roundNumber);

  return (
    <div className="space-y-3">
      {items.map((round) => (
        <Link
          key={round.roundNumber}
          href={`/tournaments/${slug}/rounds/${round.roundNumber}`}
          className="card flex items-center justify-between gap-4 p-4 hover:shadow-sm hover:border-brand-200 dark:hover:border-brand-800 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${ROUND_STATUS_COLORS[round.status]}`}>
              {round.roundNumber}
            </span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Rodada {round.roundNumber}
              </p>
              {round.publishedAt && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatDate(round.publishedAt, "dd/MM 'às' HH:mm")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={ROUND_STATUS_COLORS[round.status]}>
              {round.status === 'ongoing' && (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {ROUND_STATUS_LABELS[round.status]}
            </Badge>
            <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      ))}
    </div>
  );
}
