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
  const { slug, roundNumber } = await params;
  return { title: `Rodada ${roundNumber}` };
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

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('tournament_id', tournament.id)
    .eq('round_number', parseInt(roundNumber))
    .single();

  if (!round) notFound();

  const rn = parseInt(roundNumber);

  return (
    <div>
      {/* Round header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${ROUND_STATUS_COLORS[round.status]}`}>
            {rn}
          </span>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Rodada {rn}</h2>
            <Badge className={ROUND_STATUS_COLORS[round.status]}>
              {round.status === 'ongoing' && (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              {ROUND_STATUS_LABELS[round.status]}
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

      {/* Pairings – client component for auto-refresh */}
      <div className="card p-4">
        <RoundDetailClient roundId={round.id} tournamentId={tournament.id} tournamentSlug={slug} isOngoing={round.status === 'ongoing'} />
      </div>
    </div>
  );
}
