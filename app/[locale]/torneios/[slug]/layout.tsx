import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { SCHOOL_TOURNAMENT_SLUG } from '@/lib/statistics/school-tournament';
import { TournamentTabs } from '@/components/tournament/tournament-tabs';
import { SaveLastTournament } from '@/components/tournament/save-last-tournament';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { NotifyButton } from '@/components/tournament/notify-button';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { siteUrl, describeDates, isIndexableTournament, jsonLdString } from '@/lib/seo';
import { getTournamentStartLabel } from '@/lib/utils/date';
import { RelativeTime } from '@/components/ui/relative-time';
import type { Metadata } from 'next';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const data = await getTournamentPageData(slug);
  if (!data) return {};
  const { tournament } = data;
  const when = describeDates(tournament.start_date, tournament.end_date);
  // Descrição única por torneio — é o que a busca mostra embaixo do título.
  // Não usa o texto livre do organizador (pode ser só uma lista de links).
  const description = `Torneio de xadrez em ${tournament.city}/${tournament.state}, ${when}. ` +
    `Participantes, pareamentos por rodada e classificação${tournament.status === 'ongoing' ? ' ao vivo' : ''}.`;
  // Canonical de cada idioma aponta pra ele mesmo (pt-BR sem prefixo) — um
  // /es canônico pro pt-BR contradiria o hreflang do sitemap.
  const canonical = `${locale === 'pt-BR' ? '' : `/${locale}`}/torneios/${slug}`;
  return {
    title: `${tournament.name} — torneio de xadrez em ${tournament.city}/${tournament.state}`,
    description,
    alternates: { canonical },
    openGraph: { type: 'website', title: tournament.name, description, url: canonical },
    // Rascunho/privado abre por link, mas não deve ser indexado.
    robots: isIndexableTournament(tournament) ? undefined : { index: false, follow: false },
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
  const showStatistics = slug === SCHOOL_TOURNAMENT_SLUG;
  const lastImport = lastImportAt ? { last_run_at: lastImportAt, last_status: lastImportStatus } : null;
  const startLabel = currentRoundNumber == null && !['cancelled', 'finished'].includes(effectiveStatus)
    ? getTournamentStartLabel(tournament.start_date)
    : null;

  // Dados estruturados de evento: é o que permite ao Google mostrar o torneio
  // com data e local direto na busca. Só pra torneio indexável.
  const eventJsonLd = isIndexableTournament(tournament) ? {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: tournament.name,
    sport: 'Chess',
    url: `${siteUrl()}/torneios/${slug}`,
    startDate: tournament.start_date,
    endDate: tournament.end_date ?? tournament.start_date,
    eventStatus: tournament.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: tournament.venue || `${tournament.city}/${tournament.state}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: tournament.city,
        addressRegion: tournament.state,
        addressCountry: 'BR',
      },
    },
    ...(tournament.organizer_name && tournament.organizer_name !== 'A confirmar'
      ? { organizer: { '@type': 'Organization', name: tournament.organizer_name } }
      : {}),
    description: `Torneio de xadrez em ${tournament.city}/${tournament.state}, ${describeDates(tournament.start_date, tournament.end_date)}.`,
  } : null;

  return (
    <div>
      {eventJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(eventJsonLd) }} />
      )}
      <SaveLastTournament slug={slug} />
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="container-app py-5">
          <div className="min-w-0 mb-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h1 className="min-w-0 flex-1 break-words text-xl font-bold leading-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
                {tournament.name}
              </h1>
              <div className="flex items-center gap-2 shrink-0">
                <NotifyButton tournamentId={tournament.id} tournamentSlug={slug} />
                <ShareButton title={tournament.name} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className={startLabel ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : getTournamentStatusColor(effectiveStatus, tournament.registration_end_date, tournament.registration_closes_by_date)}>
                {effectiveStatus === 'ongoing' && !startLabel && (
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
                {startLabel ?? getTournamentStatusLabel(effectiveStatus, tournament.registration_end_date, tournament.registration_closes_by_date)}
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
                href={`/torneios/${slug}/register`}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 transition-colors"
              >
                📝 Inscrever-se no torneio
              </Link>
            )}
          </div>

          <TournamentTabs
            slug={slug}
            roundsCount={tournament.rounds_count}
            currentRoundNumber={currentRoundNumber}
            showStatistics={showStatistics}
          />
        </div>
      </div>

      <div className="container-app pb-20 pt-6 sm:pb-6">{children}</div>
    </div>
  );
}
