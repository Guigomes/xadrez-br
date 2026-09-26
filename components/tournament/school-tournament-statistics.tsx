import type {
  MedalKind,
  MedalRankingEntry,
  ParticipationEntry,
  SchoolTournamentStatistics,
} from '@/lib/statistics/school-tournament';

function percentage(value: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function medalSymbol(medal: MedalKind) {
  if (medal === 'gold') return '🥇';
  if (medal === 'silver') return '🥈';
  return '🥉';
}

function MedalRanking({
  title,
  description,
  ranking,
  limit,
}: {
  title: string;
  description: string;
  ranking: MedalRankingEntry[];
  limit: number;
}) {
  const leaders = ranking.slice(0, 3);
  const visible = ranking.slice(0, limit);

  return (
    <article className="card overflow-hidden">
      <div className="border-b border-gray-100 p-5 dark:border-gray-800">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      {leaders.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 bg-gray-50 px-4 py-5 dark:bg-gray-900/50">
            {leaders.map((entry) => (
              <div
                key={entry.key}
                className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-3 text-center dark:border-gray-700 dark:bg-gray-900"
              >
                <span className="text-xl" aria-hidden="true">
                  {entry.position === 1 ? '🏆' : entry.position === 2 ? '🥈' : '🥉'}
                </span>
                <p className="mt-1 truncate text-sm font-bold text-gray-900 dark:text-gray-100" title={entry.label}>
                  {entry.label}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {entry.gold} ouro · {entry.total} medalhas
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[31rem] text-sm">
              <thead className="border-y border-gray-100 bg-gray-50/70 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-2 py-2.5 text-left">{title === 'Por UF' ? 'UF' : 'Escola'}</th>
                  <th className="px-2 py-2.5 text-center">🥇</th>
                  <th className="px-2 py-2.5 text-center">🥈</th>
                  <th className="px-2 py-2.5 text-center">🥉</th>
                  <th className="px-2 py-2.5 text-center">Total</th>
                  <th className="px-4 py-2.5 text-center">Atletas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visible.map((entry) => (
                  <tr key={entry.key}>
                    <td className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">{entry.position}</td>
                    <td className="max-w-64 px-2 py-3 font-medium text-gray-900 dark:text-gray-100">
                      <span className="block truncate" title={entry.label}>{entry.label}</span>
                    </td>
                    <td className="px-2 py-3 text-center">{entry.gold}</td>
                    <td className="px-2 py-3 text-center">{entry.silver}</td>
                    <td className="px-2 py-3 text-center">{entry.bronze}</td>
                    <td className="px-2 py-3 text-center font-bold text-gray-900 dark:text-gray-100">{entry.total}</td>
                    <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">{entry.participants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700 dark:text-brand-300">
              Ver medalhistas dos líderes
            </summary>
            <div className="mt-3 space-y-4">
              {leaders.map((entry) => (
                <div key={entry.key}>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{entry.label}</p>
                  <ul className="mt-1 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                    {entry.medals.map((medal, index) => (
                      <li key={`${medal.groupName}-${medal.playerName}-${index}`}>
                        {medalSymbol(medal.medal)} {medal.playerName} · {medal.groupName}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </>
      ) : (
        <p className="p-5 text-sm text-gray-500 dark:text-gray-400">
          O pódio aparecerá quando a classificação tiver os primeiros colocados.
        </p>
      )}
    </article>
  );
}

function ParticipationRanking({
  title,
  entries,
  limit = 10,
}: {
  title: string;
  entries: ParticipationEntry[];
  limit?: number;
}) {
  const visible = entries.slice(0, limit);
  const maximum = visible[0]?.participants ?? 1;

  return (
    <article className="card p-5">
      <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
      <div className="mt-4 space-y-3">
        {visible.map((entry, index) => (
          <div key={entry.key}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={entry.label}>
                {index + 1}. {entry.label}
              </span>
              <span className="shrink-0 font-semibold text-gray-900 dark:text-gray-100">
                {entry.participants}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(4, (entry.participants / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function CoverageRow({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-600 dark:text-gray-300">{label}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {value} de {total} · {percentage(value, total)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function SchoolTournamentStatisticsView({ statistics }: { statistics: SchoolTournamentStatistics }) {
  const { summary } = statistics;
  const cards = [
    { label: 'Participantes', value: summary.participants },
    { label: 'Categorias', value: summary.categories },
    { label: 'UFs representadas', value: summary.states },
    { label: 'Escolas identificadas', value: summary.schools },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Estatísticas do torneio</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Panorama ao vivo do Brasileiro Escolar 2026.
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Quadro de medalhas provisório</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cada categoria entrega ouro ao 1º, prata ao 2º e bronze ao 3º. O ranking desempata por ouros, pratas e bronzes, nessa ordem.
          </p>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <MedalRanking
            title="Por UF"
            description={`Soma os pódios das ${summary.categories} categorias pela UF dos atletas.`}
            ranking={statistics.stateMedals}
            limit={statistics.stateMedals.length}
          />
          <MedalRanking
            title="Por escola"
            description="Soma os pódios usando o campo Escola/Clube do Chess-Results."
            ranking={statistics.schoolMedals}
            limit={12}
          />
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Representatividade</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tamanho das delegações para contextualizar o quadro de medalhas.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ParticipationRanking title="Maiores delegações por UF" entries={statistics.stateParticipation} />
          <ParticipationRanking title="Maiores delegações por escola" entries={statistics.schoolParticipation} />
          <ParticipationRanking title="Categorias com mais atletas" entries={statistics.categoryParticipation} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-bold text-gray-900 dark:text-gray-100">Cobertura dos dados</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Registros sem UF ou escola continuam no total de participantes, mas não entram no ranking correspondente.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <CoverageRow label="Atletas com UF" value={summary.withState} total={summary.participants} />
          <CoverageRow label="Atletas com escola" value={summary.withSchool} total={summary.participants} />
        </div>
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          Escolas são consolidadas apenas quando o nome difere em maiúsculas, minúsculas ou espaços. Abreviações diferentes permanecem separadas para evitar associações incorretas.
        </p>
      </section>
    </div>
  );
}
