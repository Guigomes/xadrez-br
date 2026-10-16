import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { isInternationalTournament, federationName, federationFlagUrl } from '@/lib/utils/federation';
import { playerDisplayName } from '@/lib/utils/player-name';
import { FederationBadge } from '@/components/player/origin-badge';
import { StateBadge } from '@/components/player/state-badge';
import { formatScore, resultLabel, resultBadgeColor } from '@/lib/utils/chess';
import { CountryPicker, CountryRankingSort } from '@/components/tournament/country-picker';
import type { StandingRow, PlayerHistoryRow } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ordem?: string; dir?: string; bord?: string; bdir?: string; pais?: string; jogador?: string }>;
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
  best: { ratio: number; rank: number; size: number; group: string } | null;
}

const pctText = (x: number) => `${Math.round(x * 100)}%`;
const winRate = (c: Pick<CountryStats, 'wins' | 'draws' | 'losses'>) => {
  const games = c.wins + c.draws + c.losses;
  return games ? (c.wins + c.draws / 2) / games : 0;
};

/**
 * Aba "Por país" — só para torneio internacional (o Mundial FIDE Sub-7 a Sub-17).
 * Agrega a classificação de todas as seções por federação e dá destaque ao Brasil. O painel
 * do topo mostra um país (padrão: Brasil; outro via ?pais=) e, escolhido um jogador
 * (?jogador=<tp_id>), as partidas dele no torneio.
 * Ordem do ranking: pódios atuais (top 3 da seção), depois top 10, depois pontos por
 * jogador — o "quadro de medalhas" parcial, que é como os países acompanham o Mundial.
 */
export default async function CountriesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getTournamentPageData(slug);
  if (!data || !isInternationalTournament(data.tournament.state)) notFound();
  const { tournament } = data;
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
  const forfeits = boardGames.filter((p) => p.result.startsWith('forfeit') || p.result === 'double_forfeit').length;
  const inProgress = boardGames.filter((p) => p.result === '*').length;
  const byes = results.filter((p) => p.is_bye && p.result === 'bye').length;
  const rated = rows.filter((r) => (r.rating_std ?? 0) > 0);
  const avgRating = rated.length ? Math.round(rated.reduce((a, r) => a + (r.rating_std ?? 0), 0) / rated.length) : null;
  const share = (n: number) => (playedOnBoard ? `${Math.round((n / playedOnBoard) * 100)}%` : '–');

  // Jogador escolhido: só vale se for deste torneio (o RPC também filtra pelo torneio).
  const selectedPlayer = sp.jogador ? rows.find((r) => r.tp_id === sp.jogador) ?? null : null;
  let games: PlayerHistoryRow[] = [];
  if (selectedPlayer) {
    const { data: hist } = await supabase.rpc('get_player_tournament_history', {
      p_tournament_id: tournament.id,
      p_tp_id: selectedPlayer.tp_id,
    });
    games = (hist ?? []) as PlayerHistoryRow[];
  }

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
      if (!c.best || ratio < c.best.ratio) c.best = { ratio, rank: r.rank, size, group };
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
    melhor: (c) => c.best?.ratio ?? 99,
  };
  const keyFn = countryKey[ord] ?? countryKey.posicao;
  const compare = (x: number | string, y: number | string) =>
    typeof x === 'string' ? x.localeCompare(String(y), 'pt-BR') : x - (y as number);
  const sortedRanking = [...ranking].sort((a, b) =>
    (ordDir === 'asc' ? 1 : -1) * compare(keyFn(a), keyFn(b)) || officialPos.get(a.code)! - officialPos.get(b.code)!,
  );
  // Cada tabela guarda a própria ordem na URL sem apagar a da outra.
  const sortHref = (table: 'r' | 'b') => (key: string, dir: Dir) => {
    const q = new URLSearchParams();
    const o = table === 'r' ? key : sp.ordem;
    const d = table === 'r' ? dir : sp.dir;
    const bo = table === 'b' ? key : sp.bord;
    const bd = table === 'b' ? dir : sp.bdir;
    if (o) q.set('ordem', o);
    if (d) q.set('dir', d);
    if (bo) q.set('bord', bo);
    if (bd) q.set('bdir', bd);
    if (sel !== HOME) q.set('pais', sel);
    if (selectedPlayer) q.set('jogador', selectedPlayer.tp_id);
    return `/torneios/${slug}/paises?${q.toString()}#${table === 'r' ? 'ranking' : 'selecao'}`;
  };
  // Link de seleção (país e, opcionalmente, jogador) mantendo a ordenação das tabelas.
  const selectHref = (country: string, tpId?: string) => {
    const q = new URLSearchParams();
    for (const k of ['ordem', 'dir', 'bord', 'bdir'] as const) if (sp[k]) q.set(k, sp[k]!);
    if (country !== HOME) q.set('pais', country);
    if (tpId) q.set('jogador', tpId);
    const qs = q.toString();
    return `/torneios/${slug}/paises${qs ? `?${qs}` : ''}#${tpId ? 'jogador' : 'selecao'}`;
  };

  const requested = (sp.pais ?? HOME).toUpperCase();
  const sel = byCountry.has(requested) ? requested : HOME;
  const isHomeSel = sel === HOME;
  const home = byCountry.get(sel);
  const homePos = officialPos.get(sel) ?? 0;
  const homePlayers = rows
    .filter((r) => r.federation?.toUpperCase() === sel)
    .sort((a, b) => groupOrder.indexOf(a.pairing_group_name ?? '—') - groupOrder.indexOf(b.pairing_group_name ?? '—') || (a.rank ?? 999) - (b.rank ?? 999));
  const bord = sp.bord ?? 'secao';
  const bDir: Dir = sp.bdir === 'asc' || sp.bdir === 'desc'
    ? sp.bdir
    : (bord === 'pontos' || bord === 'vitorias' ? 'desc' : 'asc');
  const playerKey: Record<string, (r: StandingRow) => number | string> = {
    secao: (r) => groupOrder.indexOf(r.pairing_group_name ?? '—'),
    jogador: (r) => playerDisplayName(r.full_name, r.fide_name, locale),
    colocacao: (r) => (r.rank ?? 999) / (groupSize.get(r.pairing_group_name ?? '—') ?? 1),
    pontos: (r) => Number(r.points) || 0,
    vitorias: (r) => r.wins ?? 0,
  };
  const pKey = playerKey[bord] ?? playerKey.secao;
  const homeSorted = homePlayers
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (bDir === 'asc' ? 1 : -1) * compare(pKey(a.r), pKey(b.r)) || a.i - b.i)
    .map(({ r }) => r);
  const countrySortOptions = [
    { key: 'posicao', label: 'Posição oficial', href: sortHref('r')('posicao', 'asc') },
    { key: 'pais', label: 'Nome do país', href: sortHref('r')('pais', 'asc') },
    { key: 'jogadores', label: 'Número de jogadores', href: sortHref('r')('jogadores', 'desc') },
    { key: 'podio', label: 'Jogadores no pódio', href: sortHref('r')('podio', 'desc') },
    { key: 'top10', label: 'Jogadores no top 10', href: sortHref('r')('top10', 'desc') },
    { key: 'ptsjog', label: 'Pontos por jogador', href: sortHref('r')('ptsjog', 'desc') },
    { key: 'aproveit', label: 'Aproveitamento', href: sortHref('r')('aproveit', 'desc') },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-base font-bold text-gray-900 sm:text-lg dark:text-gray-100">O Mundial em números</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[
            ['Jogadores', String(rows.length)],
            ['Países', String(byCountry.size)],
            ['Seções', String(groupOrder.length)],
            ['Rodada', `${data.currentRoundNumber ?? '–'} de ${tournament.rounds_count}`],
            ['No tabuleiro', String(playedOnBoard)],
            ['Brancas venceram', share(decided.white)],
            ['Pretas venceram', share(decided.black)],
            ['Empates', share(decided.draw)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-3 py-2.5 sm:px-4 sm:py-3 dark:bg-gray-800/60">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 sm:text-xs dark:text-gray-400">{label}</p>
              <p className="text-lg font-bold text-gray-900 sm:text-xl dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>
        {playedOnBoard > 0 && (
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full" title="Brancas · empates · pretas">
            <div className="bg-gray-200 dark:bg-gray-300" style={{ width: `${(decided.white / playedOnBoard) * 100}%` }} />
            <div className="bg-amber-300" style={{ width: `${(decided.draw / playedOnBoard) * 100}%` }} />
            <div className="bg-gray-800 dark:bg-gray-600" style={{ width: `${(decided.black / playedOnBoard) * 100}%` }} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600 sm:text-sm dark:text-gray-300">
          {inProgress > 0 && <span>{inProgress} partidas em andamento</span>}
          <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">{forfeits} W.O.</span>
          <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">{byes} byes</span>
          {avgRating && <span className="rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">Rating médio {avgRating} <span className="text-gray-400">({rated.length})</span></span>}
          {ranking.length > 0 && (() => {
            const biggest = [...ranking].sort((a, b) => b.players - a.players)[0];
            return (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 dark:bg-gray-800">
                Maior delegação: <FederationBadge federation={biggest.code} /> {federationName(biggest.code)} ({biggest.players})
              </span>
            );
          })()}
        </div>
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
                  {!isHomeSel && (
                    <> · <Link href={selectHref(HOME)} scroll={false} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">ver o Brasil</Link></>
                  )}
                </p>
              </div>
            </div>
            <CountryPicker
              slug={slug}
              current={sel}
              countries={[...ranking].sort((a, b) => federationName(a.code).localeCompare(federationName(b.code), 'pt-BR')).map((c) => ({ code: c.code, name: federationName(c.code), players: c.players }))}
              keepQuery={Object.fromEntries((['ordem', 'dir', 'bord', 'bdir'] as const).filter((k) => sp[k]).map((k) => [k, sp[k]!]))}
            />
          </div>
          <div className="grid grid-cols-3 gap-px bg-emerald-100 sm:grid-cols-5 dark:bg-emerald-900/50">
            {[
              ['Jogadores', String(home.players)],
              ['Pontos', formatScore(home.points)],
              ['Aproveitamento', pctText(winRate(home))],
              ['No top 10', String(home.top10)],
              ['No pódio', String(home.podiums)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white/80 px-2.5 py-3 sm:px-4 dark:bg-gray-900/70">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs dark:text-gray-400">{label}</p>
                <p className="text-lg font-bold text-gray-900 sm:text-xl dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>
          <div className="divide-y divide-emerald-100 sm:hidden dark:divide-emerald-900/50">
            {homeSorted.map((r) => (
              <article
                key={r.tp_id}
                className={selectedPlayer?.tp_id === r.tp_id ? 'bg-brand-50 p-4 dark:bg-brand-950/30' : 'p-4'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={selectHref(sel, r.tp_id)}
                      scroll={false}
                      className="font-semibold leading-snug text-gray-900 dark:text-gray-100"
                    >
                      {r.title && <span className="mr-1 font-normal text-gray-400">{r.title}</span>}
                      {playerDisplayName(r.full_name, r.fide_name, locale)}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{r.pairing_group_name}</span>
                      {isHomeSel && <StateBadge state={r.state} />}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100">
                    {formatScore(r.points)} pts
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-gray-900/50">
                    <span className="block text-[10px] uppercase tracking-wide text-gray-400">Colocação</span>
                    <span className={r.rank != null && r.rank <= 3 ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-gray-700 dark:text-gray-200'}>
                      {r.rank != null ? `${r.rank}º de ${groupSize.get(r.pairing_group_name ?? '—')}` : '–'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-gray-900/50">
                    <span className="block text-[10px] uppercase tracking-wide text-gray-400">Vitórias · empates · derrotas</span>
                    <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{r.wins} · {r.draws} · {r.losses}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                  <SortTh label="Jogador" sortKey="jogador" current={bord} dir={bDir} defaultDir="asc" href={sortHref('b')} className="px-4 py-2 font-semibold" />
                  <SortTh label="Seção" sortKey="secao" current={bord} dir={bDir} defaultDir="asc" href={sortHref('b')} className="px-4 py-2 font-semibold" />
                  <SortTh label="Colocação" sortKey="colocacao" current={bord} dir={bDir} defaultDir="asc" href={sortHref('b')} className="px-4 py-2 text-center font-semibold" />
                  <SortTh label="Pontos" sortKey="pontos" current={bord} dir={bDir} defaultDir="desc" href={sortHref('b')} className="px-4 py-2 text-center font-semibold" />
                  <SortTh label="V / E / D" sortKey="vitorias" current={bord} dir={bDir} defaultDir="desc" href={sortHref('b')} className="hidden px-4 py-2 text-center font-semibold sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {homeSorted.map((r) => (
                  <tr
                    key={r.tp_id}
                    className={selectedPlayer?.tp_id === r.tp_id
                      ? 'border-t border-emerald-100 bg-brand-50 dark:border-emerald-900/50 dark:bg-brand-950/30'
                      : 'border-t border-emerald-100 dark:border-emerald-900/50'}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={selectHref(sel, r.tp_id)}
                        scroll={false}
                        title="Ver as partidas no torneio"
                        className="font-medium text-gray-900 underline decoration-dotted underline-offset-2 hover:text-brand-600 dark:text-gray-100 dark:hover:text-brand-400"
                      >
                        {r.title && <span className="font-normal text-gray-400">{r.title} </span>}
                        {playerDisplayName(r.full_name, r.fide_name, locale)}
                      </Link>
                      {isHomeSel && <StateBadge state={r.state} className="ml-2 align-middle" />}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{r.pairing_group_name}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">
                      {r.rank != null ? (
                        <span className={r.rank <= 3 ? 'font-bold text-emerald-700 dark:text-emerald-400' : ''}>
                          {r.rank}º <span className="text-xs text-gray-400">de {groupSize.get(r.pairing_group_name ?? '—')}</span>
                        </span>
                      ) : '–'}
                    </td>
                    <td className="px-4 py-2.5 text-center font-bold tabular-nums">{formatScore(r.points)}</td>
                    <td className="hidden px-4 py-2.5 text-center tabular-nums text-gray-500 sm:table-cell">
                      {r.wins} / {r.draws} / {r.losses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800">
          Nenhum jogador do Brasil neste torneio.
        </p>
      )}

      {selectedPlayer && (
        <section id="jogador" className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-col items-stretch gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3 dark:border-gray-800">
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 font-bold text-gray-900 dark:text-gray-100">
                <FederationBadge federation={selectedPlayer.federation} />
                {selectedPlayer.title && <span className="font-normal text-gray-400">{selectedPlayer.title}</span>}
                {playerDisplayName(selectedPlayer.full_name, selectedPlayer.fide_name, locale)}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedPlayer.pairing_group_name}
                {selectedPlayer.rank != null && <> · {selectedPlayer.rank}º de {groupSize.get(selectedPlayer.pairing_group_name ?? '—')}</>}
                {' · '}{formatScore(selectedPlayer.points)} pts
                {selectedPlayer.rating_std ? <> · rating {selectedPlayer.rating_std}</> : null}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm sm:justify-start sm:border-0 sm:pt-0 dark:border-gray-800">
              <Link
                href={`/torneios/${slug}/players/${selectedPlayer.tp_id}${selectedPlayer.pairing_group_id ? `?group=${selectedPlayer.pairing_group_id}` : ''}`}
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Ficha completa
              </Link>
              <Link href={selectHref(sel)} scroll={false} className="text-gray-500 hover:underline">Fechar</Link>
            </div>
          </div>
          {games.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">Nenhuma partida registrada ainda.</p>
          ) : (
            <div>
              <div className="divide-y divide-gray-100 sm:hidden dark:divide-gray-800/60">
                {games.map((g) => {
                  const forWhite = g.color === 'white';
                  const unpaired = g.is_bye || !g.opponent_tp_id;
                  const oppCountry = g.opponent_federation?.toUpperCase() ?? null;
                  return (
                    <article key={g.round_number} className="p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                          <span>Rodada {g.round_number}</span>
                          {!unpaired && (
                            <span title={forWhite ? 'Brancas' : 'Pretas'} className={forWhite
                              ? 'inline-block h-3.5 w-3.5 rounded-full border border-gray-400 bg-white'
                              : 'inline-block h-3.5 w-3.5 rounded-full border border-gray-700 bg-gray-800'}
                            />
                          )}
                        </div>
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${resultBadgeColor(g.result, forWhite)}`}>
                          {resultLabel(g.result, forWhite)}
                        </span>
                      </div>
                      {unpaired ? (
                        <p className="text-sm text-gray-400">{g.result === 'not_paired' ? 'Não emparceirado' : 'Bye'}</p>
                      ) : (
                        <div className="flex items-start gap-2">
                          <FederationBadge federation={oppCountry} className="mt-0.5 px-1 py-0 text-[10px]" />
                          <div className="min-w-0">
                            <Link
                              href={oppCountry && byCountry.has(oppCountry) ? selectHref(oppCountry, g.opponent_tp_id!) : `/torneios/${slug}/players/${g.opponent_tp_id}`}
                              scroll={false}
                              className="font-medium leading-snug text-gray-900 dark:text-gray-100"
                            >
                              {g.opponent_title && <span className="mr-1 font-normal text-gray-400">{g.opponent_title}</span>}
                              {playerDisplayName(g.opponent_name, g.opponent_fide_name, locale)}
                            </Link>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {g.opponent_rating ? `Rating ${g.opponent_rating}` : 'Sem rating'}
                              {g.cumulative_pts != null && g.result !== '*' ? ` · ${formatScore(Number(g.cumulative_pts))} pts acumulados` : ''}
                            </p>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-2 font-semibold">Rodada</th>
                    <th className="px-4 py-2 font-semibold">Cor</th>
                    <th className="px-4 py-2 font-semibold">Adversário</th>
                    <th className="px-4 py-2 text-center font-semibold">Resultado</th>
                    <th className="hidden px-4 py-2 text-center font-semibold sm:table-cell">Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => {
                    const forWhite = g.color === 'white';
                    const unpaired = g.is_bye || !g.opponent_tp_id;
                    const oppCountry = g.opponent_federation?.toUpperCase() ?? null;
                    return (
                      <tr key={g.round_number} className="border-t border-gray-100 dark:border-gray-800/60">
                        <td className="px-4 py-2.5 tabular-nums text-gray-500">{g.round_number}</td>
                        <td className="px-4 py-2.5">
                          {unpaired ? '–' : (
                            <span
                              title={forWhite ? 'Brancas' : 'Pretas'}
                              className={forWhite
                                ? 'inline-block h-3.5 w-3.5 rounded-full border border-gray-400 bg-white align-middle'
                                : 'inline-block h-3.5 w-3.5 rounded-full border border-gray-700 bg-gray-800 align-middle'}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {unpaired ? (
                            <span className="text-gray-400">{g.result === 'not_paired' ? 'Não emparceirado' : 'Bye'}</span>
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <FederationBadge federation={oppCountry} className="px-1 py-0 text-[10px]" />
                              <Link
                                href={oppCountry && byCountry.has(oppCountry) ? selectHref(oppCountry, g.opponent_tp_id!) : `/torneios/${slug}/players/${g.opponent_tp_id}`}
                                scroll={false}
                                className="font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100 dark:hover:text-brand-400"
                              >
                                {g.opponent_title && <span className="font-normal text-gray-400">{g.opponent_title} </span>}
                                {playerDisplayName(g.opponent_name, g.opponent_fide_name, locale)}
                              </Link>
                              {g.opponent_rating ? <span className="text-xs text-gray-400">{g.opponent_rating}</span> : null}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${resultBadgeColor(g.result, forWhite)}`}>
                            {resultLabel(g.result, forWhite)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-2.5 text-center tabular-nums text-gray-500 sm:table-cell">
                          {g.result === '*' ? '–' : formatScore(Number(g.points_earned ?? 0))}
                          {g.cumulative_pts != null && g.result !== '*' && <span className="text-xs text-gray-400"> ({formatScore(Number(g.cumulative_pts))})</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <p className="px-5 pb-3 text-xs text-gray-400">Clique no adversário para ver as partidas dele. Entre parênteses, a pontuação acumulada após a rodada.</p>
            </div>
          )}
        </section>
      )}

      <section id="ranking" className="scroll-mt-24">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Desempenho por país</h2>
          <p className="mt-1 hidden text-xs text-gray-500 md:block dark:text-gray-400">
            Posição (#): jogadores no pódio da seção, depois no top 10, depois pontos por jogador. Clique no título de uma coluna para ordenar e no nome de um país para ver os jogadores. Classificação parcial enquanto o torneio estiver em andamento.
          </p>
          <details className="mt-1 text-xs text-gray-500 md:hidden dark:text-gray-400">
            <summary className="cursor-pointer font-medium text-brand-600 dark:text-brand-400">Como funciona a posição?</summary>
            <p className="mt-1">Primeiro conta quem está no pódio da seção, depois no top 10 e, por fim, os pontos por jogador.</p>
          </details>
        </div>
        <CountryRankingSort
          current={ord}
          direction={ordDir}
          reverseHref={sortHref('r')(ord, ordDir === 'asc' ? 'desc' : 'asc')}
          options={countrySortOptions}
        />
        <div className="mt-3 space-y-2 md:hidden">
          {sortedRanking.map((c) => {
            const isHome = c.code === HOME;
            return (
              <Link
                key={c.code}
                href={selectHref(c.code)}
                scroll={false}
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
                <SortTh label="#" sortKey="posicao" current={ord} dir={ordDir} defaultDir="asc" href={sortHref('r')} className="px-3 py-2 font-semibold" />
                <SortTh label="País" sortKey="pais" current={ord} dir={ordDir} defaultDir="asc" href={sortHref('r')} className="px-3 py-2 font-semibold" />
                <SortTh label="Jogadores" sortKey="jogadores" current={ord} dir={ordDir} defaultDir="desc" href={sortHref('r')} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Pódio" sortKey="podio" current={ord} dir={ordDir} defaultDir="desc" href={sortHref('r')} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Top 10" sortKey="top10" current={ord} dir={ordDir} defaultDir="desc" href={sortHref('r')} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Pontos" sortKey="pontos" current={ord} dir={ordDir} defaultDir="desc" href={sortHref('r')} className="hidden px-3 py-2 text-center font-semibold sm:table-cell" />
                <SortTh label="Pts/jogador" sortKey="ptsjog" current={ord} dir={ordDir} defaultDir="desc" href={sortHref('r')} className="px-3 py-2 text-center font-semibold" />
                <SortTh label="Aproveitamento" sortKey="aproveit" current={ord} dir={ordDir} defaultDir="desc" href={sortHref('r')} className="hidden px-3 py-2 text-center font-semibold sm:table-cell" />
                <SortTh label="Melhor colocação" sortKey="melhor" current={ord} dir={ordDir} defaultDir="asc" href={sortHref('r')} className="hidden px-3 py-2 font-semibold md:table-cell" />
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
                          scroll={false}
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
