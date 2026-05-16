import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { TournamentTabs } from '@/components/tournament/tournament-tabs';
import { SaveLastTournament } from '@/components/tournament/save-last-tournament';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { NotifyButton } from '@/components/tournament/notify-button';
import { TOURNAMENT_STATUS_COLORS, TOURNAMENT_STATUS_LABELS, registrationLabel } from '@/lib/utils/chess';
import { RelativeTime } from '@/components/ui/relative-time';
import type { Metadata } from 'next';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('tournaments').select('name, description, city, state').eq('slug', slug).single();
  if (!data) return {};
  return {
    title: data.name,
    description: data.description ?? `Torneio em ${data.city}, ${data.state}`,
  };
}

export default async function TournamentLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!tournament) notFound();

  // Last sync time from tournament_imports (if this tournament is auto-imported)
  const { data: lastImport } = await supabase
    .from('tournament_imports')
    .select('last_run_at, last_status')
    .eq('tournament_id', tournament.id)
    .not('last_run_at', 'is', null)
    .order('last_run_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let currentRoundNumber: number | null = null;
  if (tournament.status === 'ongoing') {
    const { data: ongoingRound } = await supabase
      .from('rounds')
      .select('round_number')
      .eq('tournament_id', tournament.id)
      .eq('status', 'ongoing')
      .maybeSingle();
    // Fall back to the last round if none is explicitly ongoing
    if (ongoingRound) {
      currentRoundNumber = ongoingRound.round_number;
    } else {
      const { data: lastRound } = await supabase
        .from('rounds')
        .select('round_number')
        .eq('tournament_id', tournament.id)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      currentRoundNumber = lastRound?.round_number ?? null;
    }
  }

  return (
    <div>
      <SaveLastTournament slug={slug} />
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="container-app py-5">
          <div className="min-w-0 mb-1">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={TOURNAMENT_STATUS_COLORS[tournament.status]}>
                  {tournament.status === 'ongoing' && (
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  )}
                  {tournament.status === 'registration'
                    ? registrationLabel(tournament.registration_end_date)
                    : TOURNAMENT_STATUS_LABELS[tournament.status]}
                </Badge>
                {tournament.tournament_type === 'swiss' && (
                  <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    Suíço
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NotifyButton tournamentId={tournament.id} tournamentSlug={slug} />
                <ShareButton title={tournament.name} />
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {tournament.name}
            </h1>
            {lastImport?.last_run_at && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                {lastImport.last_status === 'error' ? (
                  <span className="text-red-400">⚠ Sincronização com erro</span>
                ) : (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                    Sincronizado <RelativeTime iso={lastImport.last_run_at} />
                  </>
                )}
              </p>
            )}
          </div>

          <TournamentTabs slug={slug} roundsCount={tournament.rounds_count} status={tournament.status} currentRoundNumber={currentRoundNumber} />
        </div>
      </div>

      <div className="container-app py-6">{children}</div>
    </div>
  );
}
