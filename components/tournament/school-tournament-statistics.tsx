import { Link } from '@/i18n/navigation';
import type {
  MedalKind,
  ParticipationEntry,
  SchoolTournamentStatistics,
  StateAthleteStatistic,
  StateStatistic,
} from '@/lib/statistics/school-tournament';

const scoreFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function percentage(value: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function formatPoints(value: number | null) {
  if (value == null) return '–';
  return scoreFormatter.format(value);
}

function medalSymbol(medal: MedalKind) {
  if (medal === 'gold') return '🥇';
  if (medal === 'silver') return '🥈';
  return '🥉';
}

function MedalChart({ states }: { states: StateStatistic[] }) {
  const visible = states.slice(0, 12);
  const maximum = Math.max(1, ...visible.map((state) => state.total));

  return (
    <article className="card p-5">
      <h2 className="font-bold text-gray-900 dark:text-gray-100">Medalhas por UF</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Ouro, prata e bronze somados entre todas as categorias.
      </p>
      <div className="mt-5 space-y-3.5">
        {visible.map((state) => (
          <div key={state.key} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2.5">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{state.label}</span>
            <div className="flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              {state.gold > 0 && (
                <span
                  className="h-full bg-amber-400"
                  style={{ width: `${(state.gold / maximum) * 100}%` }}
                  title={`${state.gold} ouro`}
                />
              )}
              {state.silver > 0 && (
                <span
                  className="h-full bg-slate-400"
                  style={{ width: `${(state.silver / maximum) * 100}%` }}
                  title={`${state.silver} prata`}
                />
              )}
              {state.bronze > 0 && (
                <span
                  className="h-full bg-orange-600"
                  style={{ width: `${(state.bronze / maximum) * 100}%` }}
                  title={`${state.bronze} bronze`}
                />
              )}
            </div>
            <span className="w-5 text-right text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300">
              {state.total}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />Ouro</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-400" />Prata</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-orange-600" />Bronze</span>
      </div>
    </article>
  );
}

function ParticipationChart({
  title,
  description,
  entries,
  limit = 12,
}: {
  title: string;
  description: string;
  entries: ParticipationEntry[];
  limit?: number;
}) {
  const visible = entries.slice(0, limit);
  const maximum = visible[0]?.participants ?? 1;

  return (
    <article className="card p-5">
      <h2 className="font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      <div className="mt-5 space-y-3.5">
        {visible.map((entry, index) => (
          <div key={entry.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={entry.label}>
                {index + 1}. {entry.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {entry.participants}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(3, (entry.participants / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function AthleteLink({ athlete, slug }: { athlete: StateAthleteStatistic; slug: string }) {
  const href = `/torneios/${slug}/players/${athlete.participantId}${athlete.groupId ? `?group=${athlete.groupId}` : ''}`;
  return (
    <Link
      href={href}
      className="font-semibold text-gray-900 transition-colors hover:text-brand-600 dark:text-gray-100 dark:hover:text-brand-400"
    >
      {athlete.playerTitle && (
        <span className="mr-1 text-xs text-gray-400 dark:text-gray-500">{athlete.playerTitle}</span>
      )}
      {athlete.playerName}
    </Link>
  );
}

function StateAthletes({ state, slug }: { state: StateStatistic; slug: string }) {
  return (
    <section>
      <h4 className="font-bold text-gray-900 dark:text-gray-100">Desempenho individual</h4>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        A colocação é sempre relativa à categoria do atleta.
      </p>

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="hidden grid-cols-[minmax(12rem,1.5fr)_minmax(6rem,0.8fr)_4rem_5rem_4rem] gap-3 bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid dark:bg-gray-900/60 dark:text-gray-400">
          <span>Atleta</span>
          <span>Categoria</span>
          <span className="text-center">Pontos</span>
          <span className="text-center">Posição</span>
          <span className="text-right">Rating</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {state.athletes.map((athlete) => (
            <div
              key={athlete.participantId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(12rem,1.5fr)_minmax(6rem,0.8fr)_4rem_5rem_4rem]"
            >
              <div className="min-w-0">
                <AthleteLink athlete={athlete} slug={slug} />
                <p className="mt-0.5 truncate text-xs text-gray-500 sm:hidden dark:text-gray-400">
                  {athlete.groupName}{athlete.rating ? ` · Rating ${athlete.rating}` : ''}
                </p>
              </div>
              <span className="hidden min-w-0 truncate text-gray-600 sm:block dark:text-gray-300" title={athlete.groupName}>
                {athlete.groupName}
              </span>
              <span className="hidden text-center font-semibold tabular-nums text-gray-900 sm:block dark:text-gray-100">
                {formatPoints(athlete.points)}
              </span>
              <span className="text-right text-gray-600 sm:text-center dark:text-gray-300">
                <span className="whitespace-nowrap">
                  {athlete.medal && <span className="mr-1" aria-hidden="true">{medalSymbol(athlete.medal)}</span>}
                  {athlete.rank ? `${athlete.rank}º` : '–'}
                </span>
                <span className="mt-0.5 block text-xs font-medium text-gray-500 sm:hidden dark:text-gray-400">
                  {formatPoints(athlete.points)} pts
                </span>
              </span>
              <span className="hidden text-right tabular-nums text-gray-500 sm:block dark:text-gray-400">
                {athlete.rating ?? '–'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StateDetail({ state, slug }: { state: StateStatistic; slug: string }) {
  const maximumCategory = Math.max(1, ...state.categoryBreakdown.map((category) => category.participants));

  return (
    <details className="card group overflow-hidden">
      <summary className="grid cursor-pointer list-none grid-cols-[2.25rem_3rem_minmax(0,1fr)_auto] items-center gap-3 p-4 sm:grid-cols-[2.5rem_4rem_1fr_auto] sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-bold tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {state.position}º
        </span>
        <span className="text-lg font-extrabold text-gray-900 dark:text-gray-100 sm:text-xl">{state.label}</span>
        <span className="min-w-0 sm:col-start-3">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            <span>{state.participants} atletas</span>
            <span>·</span>
            <span>{state.categories} categorias</span>
            <span>·</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">{state.total} medalhas</span>
          </span>
          <span className="mt-1 flex gap-2 text-xs font-medium">
            <span>🥇 {state.gold}</span>
            <span>🥈 {state.silver}</span>
            <span>🥉 {state.bronze}</span>
          </span>
        </span>
        <span className="text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>

      <div className="border-t border-gray-100 bg-gray-50/60 p-4 sm:p-5 dark:border-gray-800 dark:bg-gray-900/30">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Atletas', value: state.participants },
            { label: 'Categorias', value: state.categories },
            { label: 'Média de pontos', value: formatPoints(state.averagePoints) },
            { label: 'Medalhas', value: state.total },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{item.value}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2fr)]">
          <section>
            <h4 className="font-bold text-gray-900 dark:text-gray-100">Presença por categoria</h4>
            <div className="mt-3 space-y-3">
              {state.categoryBreakdown.map((category) => (
                <div key={category.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-gray-700 dark:text-gray-300" title={category.label}>
                      {category.label}
                    </span>
                    <span className="shrink-0 text-gray-500 dark:text-gray-400">
                      {category.participants} · média {formatPoints(category.averagePoints)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.max(5, (category.participants / maximumCategory) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <StateAthletes state={state} slug={slug} />
        </div>
      </div>
    </details>
  );
}

export function SchoolTournamentStatisticsView({
  statistics,
  slug,
}: {
  statistics: SchoolTournamentStatistics;
  slug: string;
}) {
  const { summary } = statistics;
  const cards = [
    { label: 'Participantes', value: summary.participants },
    { label: 'Categorias', value: summary.categories },
    { label: 'UFs representadas', value: summary.states },
    { label: 'Atletas com UF', value: percentage(summary.withState, summary.participants) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Estatísticas por UF</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Panorama ao vivo da participação e do desempenho dos estados.
          </p>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          Visível só para Dev
        </span>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do torneio">
        {cards.map((card) => (
          <div key={card.label} className="card p-4 sm:p-5">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">{card.value}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">{card.label}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Panorama dos estados</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Compare os pódios e o tamanho das delegações de cada UF.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <MedalChart states={statistics.states} />
          <ParticipationChart
            title="Maiores delegações"
            description="Quantidade de atletas identificados em cada UF."
            entries={statistics.stateParticipation}
          />
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Detalhamento por estado</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Abra uma UF para ver suas categorias, médias e o desempenho individual dos atletas.
          </p>
        </div>
        <div className="space-y-3">
          {statistics.states.map((state) => <StateDetail key={state.key} state={state} slug={slug} />)}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
        <ParticipationChart
          title="Participação por categoria"
          description="Categorias com maior número de atletas no torneio."
          entries={statistics.categoryParticipation}
          limit={statistics.categoryParticipation.length}
        />
        <article className="card p-5">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">Cobertura dos dados</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Atletas sem UF continuam no total geral, mas não entram nos gráficos nem no detalhamento estadual.
          </p>
          <div className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {percentage(summary.withState, summary.participants)}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {summary.withState} de {summary.participants}
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: percentage(summary.withState, summary.participants) }}
              />
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
