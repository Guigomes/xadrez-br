import { Suspense } from 'react';
import type { Metadata } from 'next';
import { parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { AgendaFilters } from '@/components/agenda/agenda-filters';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { formatDate, todayInBrazil } from '@/lib/utils/date';
import type { TournamentListItem, TournamentStatus } from '@/types/database';

export const metadata: Metadata = {
  title: 'Agenda de torneios de xadrez',
  description: 'Calendário dos próximos torneios de xadrez no Brasil, por data, estado e situação das inscrições.',
};

interface Props {
  searchParams: Promise<{ uf?: string; status?: string }>;
}

const VALID_STATUS: TournamentStatus[] = ['published', 'registration', 'registration_closed', 'ongoing', 'finished'];

function endOf(t: TournamentListItem): string {
  return t.end_date ?? t.start_date;
}

/** "2026-10" → "Outubro de 2026" */
function monthTitle(key: string): string {
  const label = formatDate(`${key}-01`, "MMMM 'de' yyyy");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function DateBlock({ t, today }: { t: TournamentListItem; today: string }) {
  const start = parseISO(t.start_date);
  const multiDay = endOf(t) !== t.start_date;
  const running = t.start_date <= today && endOf(t) >= today;
  return (
    <div
      className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center ${
        running
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {formatDate(start, 'EEE').replace('.', '')}
      </span>
      <span className="text-2xl font-bold leading-none tabular-nums">{formatDate(start, 'dd')}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase opacity-80">
        {formatDate(start, 'MMM').replace('.', '')}
      </span>
      {multiDay && (
        <span className="mt-1 text-[10px] leading-tight opacity-80">
          até {formatDate(endOf(t), t.start_date.slice(0, 7) === endOf(t).slice(0, 7) ? 'dd' : 'dd/MM')}
        </span>
      )}
    </div>
  );
}

function AgendaItem({ t, today }: { t: TournamentListItem; today: string }) {
  const registrationOpen = t.status === 'registration' && !!t.registration_end_date && t.registration_end_date >= today;
  return (
    <Link
      href={`/torneios/${t.slug}`}
      className="card group flex gap-3 p-3 transition-all hover:border-brand-200 hover:shadow-md dark:hover:border-brand-800 sm:gap-4 sm:p-4"
    >
      <DateBlock t={t} today={today} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="min-w-0 break-words text-sm font-semibold text-gray-900 transition-colors group-hover:text-brand-600 dark:text-gray-100 dark:group-hover:text-brand-400 sm:text-base">
            {t.name}
          </h3>
          <Badge className={getTournamentStatusColor(t.status, t.registration_end_date, t.registration_closes_by_date)}>
            {t.status === 'ongoing' && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            )}
            {getTournamentStatusLabel(t.status, t.registration_end_date, t.registration_closes_by_date)}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {t.city}/{t.state}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {registrationOpen && (
            <span className="font-medium text-blue-700 dark:text-blue-300">
              Inscrições até {formatDate(t.registration_end_date!, 'dd/MM')}
            </span>
          )}
          <span>{t.rounds_count} rodadas</span>
          <span>{t.time_control}</span>
          {t.player_count > 0 && <span>{t.player_count} inscrito{t.player_count !== 1 ? 's' : ''}</span>}
        </div>
      </div>
    </Link>
  );
}

/**
 * Agenda: os torneios em ordem cronológica, agrupados por mês, pra quem quer se
 * programar. Complementa /torneios (lista de busca, mais recentes primeiro).
 * Padrão = o que ainda vai acontecer ou está acontecendo; "Encerrados" mostra o
 * passado, do mais recente pro mais antigo. Filtros vivem na URL e a lista chega
 * pronta no primeiro HTML.
 */
export default async function AgendaPage({ searchParams }: Props) {
  const { uf, status } = await searchParams;
  const statusFilter = VALID_STATUS.includes(status as TournamentStatus) ? (status as TournamentStatus) : undefined;
  const pastView = statusFilter === 'finished';
  const today = todayInBrazil();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_tournaments', {
    p_state: uf || undefined,
    p_status: statusFilter,
    p_limit: 500,
    p_offset: 0,
  });

  const all = (data ?? []) as TournamentListItem[];
  const visible = pastView
    ? all
    : all.filter((t) => t.status !== 'finished' && t.status !== 'cancelled' && endOf(t) >= today);

  visible.sort((a, b) =>
    pastView
      ? b.start_date.localeCompare(a.start_date)
      : a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name, 'pt-BR'),
  );

  // "Acontecendo agora" vem antes dos meses: torneio que começou mês passado e
  // ainda roda não pode sumir da agenda nem ficar enterrado num mês que acabou.
  const now = pastView ? [] : visible.filter((t) => t.start_date <= today);
  const rest = pastView ? visible : visible.filter((t) => t.start_date > today);

  const months: { key: string; items: TournamentListItem[] }[] = [];
  for (const t of rest) {
    const key = t.start_date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.items.push(t);
    else months.push({ key, items: [t] });
  }

  return (
    <div className="container-app py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">Agenda de torneios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {pastView ? 'Torneios já realizados.' : 'Os próximos torneios em ordem de data, para você se programar.'}
        </p>
      </div>

      {/* useSearchParams exige Suspense em página renderizada no servidor. */}
      <Suspense fallback={<div className="mb-6 h-24" />}>
        <AgendaFilters />
      </Suspense>

      {error ? (
        <EmptyState icon="⚠️" title="Erro ao carregar a agenda" description="Tente novamente em instantes." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="📅"
          title="Nenhum torneio na agenda"
          description="Tente outro estado ou outra situação, ou volte em breve — novos torneios entram aqui assim que são publicados."
        />
      ) : (
        <div className="space-y-8">
          {now.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
                Acontecendo agora
              </h2>
              <div className="space-y-3">
                {now.map((t) => <AgendaItem key={t.id} t={t} today={today} />)}
              </div>
            </section>
          )}
          {months.map((m) => (
            <section key={m.key}>
              <h2 className="sticky top-14 z-10 -mx-4 mb-3 border-b border-gray-200 bg-white/90 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-gray-500 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90 dark:text-gray-400 sm:mx-0 sm:px-0">
                {monthTitle(m.key)}
                <span className="ml-2 font-normal normal-case text-gray-400 dark:text-gray-500">
                  · {m.items.length} torneio{m.items.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="space-y-3">
                {m.items.map((t) => <AgendaItem key={t.id} t={t} today={today} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Procurando por nome ou cidade? Use a{' '}
        <Link href="/torneios" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          lista completa de torneios
        </Link>
        .
      </p>
    </div>
  );
}
