import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { TournamentTabs } from '@/components/tournament/tournament-tabs';
import { SaveLastTournament } from '@/components/tournament/save-last-tournament';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { NotifyButton } from '@/components/tournament/notify-button';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { RelativeTime } from '@/components/ui/relative-time';
import type { Metadata } from 'next';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  if (!data) return {};
  const { tournament } = data;
  return {
    title: tournament.name,
    description: tournament.description ?? `Torneio em ${tournament.city}, ${tournament.state}`,
  };
}

export default async function TournamentLayout({ children, params }: Props) {
  const { slug } = await params;

  // get_tournament_page_data (migration 071) resolve tudo isto num round-trip
  // só: status corrigido por data (get_tournament_by_slug, 040), rodada atual
  // e status efetivo (considerando pendências de resultado), e último sync de
  // import — tudo antes calculado aqui em Node com até 4 queries sequenciais.
  // Ver lib/data/tournament-page-data.ts.
  const data = await getTournamentPageData(slug);

  if (!data) notFound();

  const { tournament, currentRoundNumber, effectiveStatus, lastImportAt, lastImportStatus } = data;
  const lastImport = lastImportAt ? { last_run_at: lastImportAt, last_status: lastImportStatus } : null;

  return (
    <div>
      <SaveLastTournament slug={slug} />
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="container-app py-5">
          <div className="min-w-0 mb-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                {tournament.name}
              </h1>
              <div className="flex items-center gap-2 shrink-0">
                <NotifyButton tournamentId={tournament.id} tournamentSlug={slug} />
                <ShareButton title={tournament.name} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className={getTournamentStatusColor(effectiveStatus, tournament.registration_end_date, tournament.registration_closes_by_date)}>
                {effectiveStatus === 'ongoing' && (
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
                {getTournamentStatusLabel(effectiveStatus, tournament.registration_end_date, tournament.registration_closes_by_date)}
              </Badge>
              {tournament.tournament_type === 'swiss' && (
                <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  Suíço
                </Badge>
              )}
            </div>
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
            {effectiveStatus === 'registration' && (
              <Link
                href={`/tournaments/${slug}/register`}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 transition-colors"
              >
                📝 Inscrever-se no torneio
              </Link>
            )}
          </div>

          <TournamentTabs slug={slug} roundsCount={tournament.rounds_count} status={effectiveStatus} currentRoundNumber={currentRoundNumber} />
        </div>
      </div>

      <div className="container-app py-6">{children}</div>
    </div>
  );
}
