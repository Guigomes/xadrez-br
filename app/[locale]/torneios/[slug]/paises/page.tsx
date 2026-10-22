import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { isInternationalTournament, federationName, federationFlagUrl } from '@/lib/utils/federation';
import { playerDisplayName } from '@/lib/utils/player-name';
import { FederationBadge } from '@/components/player/origin-badge';
import { formatScore } from '@/lib/utils/chess';
import { normalizeSearchText } from '@/lib/utils/text';
import { CountryPicker, CountryRankingSort } from '@/components/tournament/country-picker';
import type { StandingRow } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ordem?: string; dir?: string; bord?: string; bdir?: string; pais?: string; jogador?: string; q?: string }>;
}

type Dir = 'asc' | 'desc';

/** Cabeçalho que ordena a tabela: link que troca a coluna (ou inverte o sentido) na URL. */
function SortTh({ label, sortKey, current, dir, defaultDir, href, className = '' }: {
  label: string; sortKey: string; current: string; dir: Dir; defaultDir: Dir;
  href: (key: string, dir: Dir) => string; className?: string;
}) {
  const active = current === sortKey;
  const next: Dir = active ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir;
  return (
    <th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link
        href={href(sortKey, next)}
        scroll={false}
        className={'inline-flex items-center gap-0.5 hover:text-brand-600 dark:hover:text-brand-400' + (active ? ' text-gray-900 dark:text-gray-100' : '')}
      >
        {label}
        <span aria-hidden className={active ? '' : 'opacity-30'}>{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </Link>
    </th>
  );
}

const HOME = 'BRA';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  return { title: data ? `Desempenho por país — ${data.tournament.name}` : 'Desempenho por país' };
}

interface CountryStats {
  code: string;
  players: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  podiums: number;
  top10: number;
  /** Melhor colocação relativa (posição / tamanho do grupo) e sua descrição. */
  best: { ratio: number; rank: number; size: number; group: string; player: StandingRow } | null;
}

const pctText = (x: number) => `${Math.round(x * 100)}%`;
const winRate = (c: Pick<CountryStats, 'wins' | 'draws' | 'losses'>) => {
  const games = c.wins + c.draws + c.losses;
  return games ? (c.wins + c.draws / 2) / games : 0;
};

/**
 * Aba "Por país" — habilitada pela configuração internacional do torneio.
 * Agrega a classificação de todas as seções por federação e dá destaque ao Brasil. O painel
 * do topo mostra um país (padrão: Brasil, quando presente). Os jogadores abrem
 * numa página própria, com busca e acesso à ficha completa.
 * Ordem do ranking: pódios atuais (top 3 da seção), depois top 10, depois pontos por
 * jogador — o "quadro de medalhas" parcial, que é como os países acompanham o Mundial.
 */
export default async function CountriesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getTournamentPageData(slug);
  if (!data || !isInternationalTournament(data.tournament.is_international)) notFound();
  const { tournament, currentRoundNumber } = data;
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: raw } = await supabase.rpc('get_tournament_standings', { p_tournament_id: tournament.id });
  const rows = ((raw ?? []) as StandingRow[]).filter((r) => r.federation);

  const groupSize = new Map<string, number>();
  for (const r of rows) {
    const g = r.pairing_group_name ?? '—';
    groupSize.set(g, (groupSize.get(g) ?? 0) + 1);
  }
  const groupOrder = [...new Set(rows.map((r) => r.pairing_group_name ?? '—'))];

  // Estatísticas gerais: resultados de todas as partidas do torneio (todas as seções).
  const results: { result: string; is_bye: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page } = await supabase
      .from('pairings')
      .select('id, result, is_bye')
      .eq('tournament_id', tournament.id)
      .order('id')
      .range(from, from + 999);
    results.push(...((page ?? []) as { result: string; is_bye: boolean }[]));
    if (!page || page.length < 1000) break;
  }
  const boardGames = results.filter((p) => !p.is_bye);
  const decided = {
    white: boardGames.filter((p) => p.result === '1-0').length,
    black: boardGames.filter((p) => p.result === '0-1').length,
    draw: boardGames.filter((p) => p.result === '1/2-1/2').length,
  };
  const playedOnBoard = decided.white + decided.black + decided.draw;
  const rated = rows.filter((r) => (r.rating_std ?? 0) > 0);
  const avgRating = rated.length ? Math.round(rated.reduce((a, r) => a + (r.rating_std ?? 0), 0) / rated.length) : null;

  // Links antigos continuam abrindo a ficha completa do jogador.
  if (sp.jogador && rows.some((row) => row.tp_id === sp.jogador)) {
    redirect({ href: `/torneios/${slug}/players/${sp.jogador}`, locale });
  }
  const searchQuery = sp.q?.trim().slice(0, 80) ?? '';
  const normalize = normalizeSearchText;

  const byCountry = new Map<string, CountryStats>();
  for (const r of rows) {
    const code = r.federation!.toUpperCase();
    const c = byCountry.get(code) ?? { code, players: 0, points: 0, wins: 0, draws: 0, losses: 0, podiums: 0, top10: 0, best: null };
    c.players++;
    c.points += Number(r.points) || 0;
    c.wins += r.wins ?? 0;
    c.draws += r.draws ?? 0;
    c.losses += r.losses ?? 0;
    if (r.rank != null) {
      if (r.rank <= 3) c.podiums++;
      if (r.rank <= 10) c.top10++;
      const group = r.pairing_group_name ?? '—';
      const size = groupSize.get(group) ?? 1;
      const ratio = r.rank / size;
      // Posição absoluta (14º vence 31º, mesmo que o 31º seja numa seção maior); empate: seção maior.
      if (!c.best || r.rank < c.best.rank || (r.rank === c.best.rank && size > c.best.size)) c.best = { ratio, rank: r.rank, size, group, player: r };
    }
    byCountry.set(code, c);
  }

  const ranking = [...byCountry.values()].sort((a, b) =>
    b.podiums - a.podiums || b.top10 - a.top10 || b.points / b.players - a.points / a.players || a.code.localeCompare(b.code),
  );
  // O ranking oficial (quadro de medalhas) define a coluna "#" e a posição do Brasil; a
  // ordenação escolhida no cabeçalho só muda a ordem de exibição.
  const officialPos = new Map(ranking.map((c, i) => [c.code, i + 1]));
  const ord = sp.ordem ?? 'posicao';
  const ordDir: Dir = sp.dir === 'asc' || sp.dir === 'desc'
    ? sp.dir
    : (ord === 'posicao' || ord === 'pais' || ord === 'melhor' ? 'asc' : 'desc');
  const countryKey: Record<string, (c: CountryStats) => number | string> = {
    posicao: (c) => officialPos.get(c.code) ?? 0,
    pais: (c) => federationName(c.code),
    jogadores: (c) => c.players,
    podio: (c) => c.podiums,
    top10: (c) => c.top10,
    pontos: (c) => c.points,
    ptsjog: (c) => c.points / c.players,
    aproveit: (c) => winRate(c),
    melhor: (c) => (c.best ? c.best.rank - c.best.size / 100000 : 99999),
  };
  const keyFn = countryKey[ord] ?? countryKey.posicao;
  const compare = (x: number | string, y: number | string) =>
    typeof x === 'string' ? x.localeCompare(String(y), 'pt-BR') : x - (y as number);
  const sortedRanking = ranking.filter((country) => !searchQuery || normalize(`${country.code} ${federationName(country.code)}`).includes(normalize(searchQuery))).sort((a, b) =>
    (ordDir === 'asc' ? 1 : -1) * compare(keyFn(a), keyFn(b)) || officialPos.get(a.code)! - officialPos.get(b.code)!,
  );
  const sortHref = (key: string, dir: Dir) => {
    const q = new URLSearchParams();
    q.set('ordem', key);
    q.set('dir', dir);
    if (sel !== HOME) q.set('pais', sel);
    if (searchQuery) q.set('q', searchQuery);
    return `/torneios/${slug}/paises?${q.toString()}#ranking`;
  };
  const selectHref = (country: string) => `/torneios/${slug}/paises/${country}`;

  const requested = (sp.pais ?? HOME).toUpperCase();
  const sel = byCountry.has(requested) ? requested : byCountry.has(HOME) ? HOME : ranking[0]?.code ?? HOME;
  const isHomeSel = sel === HOME;
  const home = byCountry.get(sel);
  const homePos = officialPos.get(sel) ?? 0;
  const homePlayers = rows
    .filter((r) => r.federation?.toUpperCase() === sel)
    .sort((a, b) => groupOrder.indexOf(a.pairing_group_name ?? '—') - groupOrder.indexOf(b.pairing_group_name ?? '—') || (a.rank ?? 999) - (b.rank ?? 999));
  const homeRated = homePlayers.filter((r) => (r.rating_std ?? 0) > 0);
  const homeAvgRating = homeRated.length
    ? Math.round(homeRated.reduce((a, r) => a + (r.rating_std ?? 0), 0) / homeRated.length)
    : null;
  const countrySortOptions = [
    { key: 'posicao', label: 'Posição oficial', href: sortHref('posicao', 'asc') },
    { key: 'pais', label: 'Nome do país', href: sortHref('pais', 'asc') },
    { key: 'jogadores', label: 'Número de jogadores', href: sortHref('jogadores', 'desc') },
    { key: 'podio', label: 'Jogadores no pódio', href: sortHref('podio', 'desc') },
    { key: 'top10', label: 'Jogadores no top 10', href: sortHref('top10', 'desc') },
    { key: 'pontos', label: 'Pontos totais', href: sortHref('pontos', 'desc') },
    { key: 'ptsjog', label: 'Pontos por jogador', href: sortHref('ptsjog', 'desc') },
    { key: 'aproveit', label: 'Aproveitamento', href: sortHref('aproveit', 'desc') },
    { key: 'melhor', label: 'Melhor colocação', href: sortHref('melhor', 'asc') },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-base font-bold text-gray-900 sm:text-lg dark:text-gray-100">O torneio em números</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
          {[
            ['Jogadores', String(rows.length)],
            ['Países', String(byCountry.size)],
            ['Seções', String(groupOrder.length)],
            ['Rodada', `${currentRoundNumber ?? '–'} de ${tournament.rounds_count}`],
            ['Partidas jogadas', String(playedOnBoard)],
            ['Rating médio', avgRating ? String(avgRating) : '–'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-3 py-2.5 sm:px-4 sm:py-3 dark:bg-gray-800/60">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 sm:text-xs dark:text-gray-400">{label}</p>
              <p className="text-lg font-bold text-gray-900 sm:text-xl dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>
        {ranking.length > 0 && (() => {
          const biggest = [...ranking].sort((a, b) => b.players - a.players)[0];
          return (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
              Maior delegação: <FederationBadge federation={biggest.code} /> {federationName(biggest.code)} ({biggest.players} jogadores)
            </p>
          );
        })()}
      </section>

      {home ? (
        <section
          id="selecao"
          className={isHomeSel
            ? 'scroll-mt-24 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 via-white to-yellow-50 shadow-sm dark:border-emerald-600 dark:from-emerald-950/40 dark:via-gray-900 dark:to-yellow-950/20'
            : 'scroll-mt-24 overflow-hidden rounded-2xl border-2 border-brand-300 bg-white shadow-sm dark:border-brand-800 dark:bg-gray-900'}
        >
          <div className="flex flex-col items-stretch gap-4 border-b border-emerald-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-emerald-900">
            <div className="flex min-w-0 items-center gap-3">
              {federationFlagUrl(sel) ? (
                // eslint-disable-next-line @next/next/no-img-element -- SVG estático
                <img src={federationFlagUrl(sel)!} alt="" width={44} height={33} className="h-[33px] w-11 rounded object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.1)]" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-xs font-black text-gray-700 dark:bg-gray-700 dark:text-gray-200">{sel}</span>
              )}
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {federationName(sel)}<span className="hidden sm:inline"> no {tournament.name}</span>
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {homePos}º entre {ranking.length} países
                  {!isHomeSel && byCountry.has(HOME) && (
                    <> · <Link href={selectHref(HOME)} scroll={false} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">ver o Brasil</Link></>
                  )}
                </p>
              </div>
            </div>
            <CountryPicker
              slug={slug}
              current={sel}
              countries={[...ranking].sort((a, b) => federationName(a.code).localeCompare(federationName(b.code), 'pt-BR')).map((c) => ({ code: c.code, name: federationName(c.code), players: c.players }))}
              keepQuery={Object.fromEntries((['ordem', 'dir', 'q'] as const).filter((k) => sp[k]).map((k) => [k, sp[k]!]))}
            />
          </div>
          <div className="grid grid-cols-2 gap-px bg-emerald-100 sm:grid-cols-4 dark:bg-emerald-900/50">
            {([
              ['Jogadores', String(home.players)],
              ['Pontos', formatScore(home.points), `${(home.points / home.players).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por jogador`],
              ['Aproveitamento', pctText(winRate(home))],
              ['V / E / D', `${home.wins} / ${home.draws} / ${home.losses}`],
              ['Melhor colocação', home.best ? `${home.best.rank}º de ${home.best.size}` : '–', home.best ? `${playerDisplayName(home.best.player.full_name, home.best.player.fide_name, locale)} · ${home.best.group}` : undefined],
              ['Rating médio', homeAvgRating ? String(homeAvgRating) : '–'],
              ['No top 10', String(home.top10)],
              ['No pódio', String(home.podiums)],
            ] as [string, string, string?][]).map(([label, value, sub]) => (
              <div key={label} className="bg-white/80 px-2.5 py-3 sm:px-4 dark:bg-gray-900/70">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs dark:text-gray-400">{label}</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 sm:text-xl dark:text-gray-100">{value}</p>
                {sub && <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">{sub}</p>}
              </div>
            ))}
          </div>
          <Link href={selectHref(sel)} className="flex min-h-12 items-center justify-between border-t border-emerald-200 px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:px-5 dark:border-emerald-900 dark:text-brand-300 dark:hover:bg-brand-950/30">
            <span>Ver {home.players} {home.players === 1 ? 'jogador' : 'jogadores'} · {federationName(sel)}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800">
          Nenhum jogador do Brasil neste torneio.
        </p>
      )}

      <section id="ranking" className="scroll-mt-24">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Desempenho por país</h2>
          <p className="mt-1 hidden text-xs text-gray-500 md:block dark:text-gray-400">
            Posição (#): jogadores no pódio da seção, depois no top 10, depois pontos por jogador. Clique no título de uma coluna para ordenar e no nome de um país para ver os números e os jogadores dele. Classificação parcial enquanto o torneio estiver em andamento.
          </p>
          <details className="mt-1 text-xs text-gray-500 md:hidden dark:text-gray-400">
            <summary className="cursor-pointer font-medium text-brand-600 dark:text-brand-400">Como funciona a posição?</summary>
            <p className="mt-1">Primeiro conta quem está no pódio da seção, depois no top 10 e, por fim, os pontos por jogador.</p>
          </details>
        </div>
        <form action={`/torneios/${slug}/paises#ranking`} className="mb-3 flex flex-col gap-2 sm:flex-row">
          {(['ordem', 'dir', 'pais'] as const).map((key) => sp[key] ? <input key={key} type="hidden" name={key} value={sp[key]} /> : null)}
          <label className="min-w-0 flex-1">
            <span className="sr-only">Buscar país</span>
            <input type="search" name="q" defaultValue={searchQuery} placeholder="Buscar país por nome ou sigla" className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Buscar país</button>
          {searchQuery && <Link href={`/torneios/${slug}/paises?pais=${sel}#ranking`} className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-brand-600 dark:text-brand-400">Limpar busca</Link>}
        </form>
        {searchQuery && <p className="mb-3 text-sm text-gray-500">{sortedRanking.length} {sortedRanking.length === 1 ? 'país encontrado' : 'países encontrados'}</p>}
        <CountryRankingSort
          current={ord}
          direction={ordDir}
          reverseHref={sortHref(ord, ordDir === 'asc' ? 'desc' : 'asc')}
          options={countrySortOptions}
        />
        <div className="mt-3 space-y-2 md:hidden">
          {sortedRanking.map((c) => {
            const isHome = c.code === HOME;
            return (
              <Link
                key={c.code}
                href={selectHref(c.code)}
                className={isHome
                  ? 'block rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3.5 dark:border-emerald-600 dark:bg-emerald-950/40'
                  : 'block rounded-xl border border-gray-200 bg-white p-3.5 dark:border-gray-800 dark:bg-gray-900'}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">{officialPos.get(c.code)}º</span>
                    <FederationBadge federation={c.code} />
                    <span className={isHome ? 'truncate font-bold text-emerald-800 dark:text-emerald-300' : 'truncate font-semibold text-gray-900 dark:text-gray-100'}>
                      {federationName(c.code)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-400">Ver jogadores</span>
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-1 text-center">
                  {[
                    ['Jogadores', String(c.players)],
                    ['Pódio', String(c.podiums || '–')],
                    ['Top 10', String(c.top10 || '–')],
                    ['Pts/jog.', (c.points / c.players).toFixed(2).replace('.', ',')],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-gray-50 px-1 py-2 dark:bg-gray-800/60">
                      <dt className="text-[9px] uppercase tracking-wide text-gray-400">{label}</dt>
                      <dd className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-gray-200 md:block dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                <SortTh label="#" sortKey="posicao" current={ord} dir={ordDir} defaultDir="asc" href={sortHref} className="px-3 py-2 font-semibold" />
                <SortTh label="País" sortKey="pais" current={ord} dir={ordDir} defaultDir="asc" href={sortHref} className="px-3 py-2 font-semibold" />
                <SortTh label="Jogadores" sortKey="jogadores" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Pódio" sortKey="podio" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Top 10" sortKey="top10" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Pontos" sortKey="pontos" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="hidden px-3 py-2 text-center font-semibold sm:table-cell" />
                <SortTh label="Pts/jogador" sortKey="ptsjog" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Aproveitamento" sortKey="aproveit" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="hidden px-3 py-2 text-center font-semibold sm:table-cell" />
                <SortTh label="Melhor colocação" sortKey="melhor" current={ord} dir={ordDir} defaultDir="asc" href={sortHref} className="hidden px-3 py-2 font-semibold md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {sortedRanking.map((c) => {
                const isHome = c.code === HOME;
                return (
                  <tr
                    key={c.code}
                    className={isHome
                      ? 'border-y-2 border-emerald-500 bg-emerald-50 font-semibold dark:border-emerald-600 dark:bg-emerald-950/40'
                      : 'border-b border-gray-100 dark:border-gray-800/60'}
                  >
                    <td className="px-3 py-2 tabular-nums text-gray-500">{officialPos.get(c.code)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <FederationBadge federation={c.code} />
                        <Link
                          href={selectHref(c.code)}
                          title="Ver os jogadores deste país"
                          className={(isHome ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200') + ' hover:text-brand-600 hover:underline dark:hover:text-brand-400' + (c.code === sel ? ' underline' : '')}
                        >
                          {federationName(c.code)}
                        </Link>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.players}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.podiums || '–'}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{c.top10 || '–'}</td>
                    <td className="hidden px-3 py-2 text-center tabular-nums sm:table-cell">{formatScore(c.points)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{(c.points / c.players).toFixed(2).replace('.', ',')}</td>
                    <td className="hidden px-3 py-2 text-center tabular-nums sm:table-cell">{pctText(winRate(c))}</td>
                    <td className="hidden px-3 py-2 text-xs text-gray-500 md:table-cell">
                      {c.best ? `${c.best.rank}º de ${c.best.size} · ${c.best.group}` : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Aproveitamento: pontos nas partidas disputadas (vitória 1, empate ½), sem contar byes. Pódio e top 10 são a posição atual de cada jogador na classificação da própria seção.
        </p>
      </section>
    </div>
  );
}
