import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import { isInternationalTournament, federationName } from '@/lib/utils/federation';
import { playerDisplayName } from '@/lib/utils/player-name';
import { FederationBadge } from '@/components/player/origin-badge';
import { StateBadge } from '@/components/player/state-badge';
import { formatScore } from '@/lib/utils/chess';
import type { StandingRow } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ordem?: string; dir?: string; bord?: string; bdir?: string }>;
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
 * Agrega a classificação de todas as seções por federação e dá destaque ao Brasil.
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
    return `/torneios/${slug}/paises?${q.toString()}#${table === 'r' ? 'ranking' : 'brasil'}`;
  };

  const home = byCountry.get(HOME);
  const homePos = ranking.findIndex((c) => c.code === HOME) + 1;
  const homePlayers = rows
    .filter((r) => r.federation?.toUpperCase() === HOME)
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

  return (
    <div className="space-y-6">
      {home ? (
        <section id="brasil" className="scroll-mt-4 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 via-white to-yellow-50 shadow-sm dark:border-emerald-600 dark:from-emerald-950/40 dark:via-gray-900 dark:to-yellow-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 px-5 py-4 dark:border-emerald-900">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-yellow-300">BRA</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Brasil no {tournament.name}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {homePos}º entre {ranking.length} países
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-emerald-100 sm:grid-cols-5 dark:bg-emerald-900/50">
            {[
              ['Jogadores', String(home.players)],
              ['Pontos', formatScore(home.points)],
              ['Aproveitamento', pctText(winRate(home))],
              ['No top 10', String(home.top10)],
              ['No pódio', String(home.podiums)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white/80 px-4 py-3 dark:bg-gray-900/70">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
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
                  <tr key={r.tp_id} className="border-t border-emerald-100 dark:border-emerald-900/50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/torneios/${slug}/players/${r.tp_id}${r.pairing_group_id ? `?group=${r.pairing_group_id}` : ''}`}
                        className="font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100 dark:hover:text-brand-400"
                      >
                        {r.title && <span className="font-normal text-gray-400">{r.title} </span>}
                        {playerDisplayName(r.full_name, r.fide_name, locale)}
                      </Link>
                      <StateBadge state={r.state} className="ml-2 align-middle" />
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

      <section id="ranking" className="scroll-mt-4">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Desempenho por país</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Posição (#): jogadores no pódio da seção, depois no top 10, depois pontos por jogador. Clique no título de uma coluna para ordenar. Classificação parcial enquanto o torneio estiver em andamento.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
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
                        <span className={isHome ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200'}>{federationName(c.code)}</span>
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
