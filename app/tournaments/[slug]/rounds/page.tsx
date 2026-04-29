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
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('round_number');

  if (!rounds?.length) {
    return <EmptyState icon="📋" title="Nenhuma rodada criada" description="As rodadas serão publicadas pelo organizador." />;
  }

  return (
    <div className="space-y-3">
      {rounds.map((round) => (
        <Link
          key={round.id}
          href={`/tournaments/${slug}/rounds/${round.round_number}`}
          className="card flex items-center justify-between gap-4 p-4 hover:shadow-sm hover:border-brand-200 dark:hover:border-brand-800 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${ROUND_STATUS_COLORS[round.status]}`}>
              {round.round_number}
            </span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Rodada {round.round_number}
              </p>
              {round.published_at && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatDate(round.published_at, "dd/MM 'às' HH:mm")}
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
