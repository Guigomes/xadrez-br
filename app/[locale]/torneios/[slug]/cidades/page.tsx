import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTournamentPageData } from '@/lib/data/tournament-page-data';
import {
  getFinishedPairingResults, getFinishedPlayerPlaces, getFinishedStandings, loadPlayerPlaces, type PlayerPlace,
} from '@/lib/data/finished-cache';
import { buildCityRanking, cityWinRate, resolveCity, type CityStats } from '@/lib/tournament/city-ranking';
import { playerDisplayName } from '@/lib/utils/player-name';
import { formatScore } from '@/lib/utils/chess';
import { normalizeSearchText } from '@/lib/utils/text';
import { CountryPicker, CountryRankingSort } from '@/components/tournament/country-picker';
import type { StandingRow } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ordem?: string; dir?: string; cidade?: string; q?: string }>;
}

type Dir = 'asc' | 'desc';

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTournamentPageData(slug);
  return { title: data ? `Desempenho por cidade — ${data.tournament.name}` : 'Desempenho por cidade' };
}

const pctText = (x: number) => `${Math.round(x * 100)}%`;
const perPlayer = (c: CityStats) => (c.points / c.players).toFixed(2).replace('.', ',');

/**
 * Aba "Por cidade" (tournaments.show_city_ranking) — a mesma ideia da "Por país" dos
 * internacionais, agregando pela cidade dos jogadores (players.city, só municípios do IBGE).
 * Destaque para a cidade-sede. Torneio encerrado lê classificação, cidades e resultados do
 * cache do servidor (lib/data/finished-cache.ts).
 */
export default async function CitiesPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getTournamentPageData(slug);
  if (!data || !data.tournament.show_city_ranking) notFound();
  const { tournament, currentRoundNumber, effectiveStatus } = data;
  const locale = await getLocale();
  const finished = effectiveStatus === 'finished';
  const supabase = await createClient();

  const [standings, places, results] = await Promise.all([
    (async () => (finished ? await getFinishedStandings(tournament.id) : null)
      ?? ((await supabase.rpc('get_tournament_standings', { p_tournament_id: tournament.id })).data as StandingRow[] | null) ?? [])(),
    (async (): Promise<PlayerPlace[]> => (finished ? await getFinishedPlayerPlaces(tournament.id) : null)
      ?? await loadPlayerPlaces(tournament.id).catch(() => []))(),
    (async () => {
      const cached = finished ? await getFinishedPairingResults(tournament.id) : null;
      if (cached) return cached;
      const all: { result: string; is_bye: boolean }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page } = await supabase.from('pairings').select('id, result, is_bye')
          .eq('tournament_id', tournament.id).order('id').range(from, from + 999);
        all.push(...((page ?? []) as { result: string; is_bye: boolean }[]));
        if (!page || page.length < 1000) break;
      }
      return all;
    })(),
  ]);

  const rows = standings;
  const homeByTp = new Map(places.map((p) => [p.tp_id, p]));
  const { ranking, placeByTp, cityByTp, withoutCity } = buildCityRanking(rows, homeByTp, tournament.state);
  const groupOrder = [...new Set(rows.map((r) => r.pairing_group_name ?? '—'))];
  const playedOnBoard = results.filter((p) => !p.is_bye && ['1-0', '0-1', '1/2-1/2'].includes(p.result)).length;
  const rated = rows.filter((r) => (r.rating_tempo ?? 0) > 0);
  const avgRating = rated.length ? Math.round(rated.reduce((a, r) => a + (r.rating_tempo ?? 0), 0) / rated.length) : null;

  const host = resolveCity(tournament.city, tournament.state, tournament.state);
  const officialPos = new Map(ranking.map((c, i) => [c.city.key, i + 1]));
  const searchQuery = sp.q?.trim().slice(0, 80) ?? '';
  const ord = sp.ordem ?? 'posicao';
  const ordDir: Dir = sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : (ord === 'posicao' || ord === 'cidade' || ord === 'melhor' ? 'asc' : 'desc');
  const keyOf: Record<string, (c: CityStats) => number | string> = {
    posicao: (c) => officialPos.get(c.city.key) ?? 0,
    cidade: (c) => c.city.name,
    jogadores: (c) => c.players,
    podio: (c) => c.podiums,
    top10: (c) => c.top10,
    pontos: (c) => c.points,
    ptsjog: (c) => c.points / c.players,
    aproveit: (c) => cityWinRate(c),
    melhor: (c) => (c.best ? c.best.rank - c.best.size / 100000 : 99999),
  };
  const keyFn = keyOf[ord] ?? keyOf.posicao;
  const compare = (x: number | string, y: number | string) => (typeof x === 'string' ? x.localeCompare(String(y), 'pt-BR') : x - (y as number));
  const sortedRanking = ranking
    .filter((c) => !searchQuery || normalizeSearchText(`${c.city.name} ${c.city.uf}`).includes(normalizeSearchText(searchQuery)))
    .sort((a, b) => (ordDir === 'asc' ? 1 : -1) * compare(keyFn(a), keyFn(b)) || officialPos.get(a.city.key)! - officialPos.get(b.city.key)!);

  const requested = sp.cidade?.toLowerCase();
  const sel = ranking.find((c) => c.city.key === requested) ?? (host && ranking.find((c) => c.city.key === host.key)) ?? ranking[0];
  const isHostSel = !!sel && !!host && sel.city.key === host.key;
  const tab = `/torneios/${slug}/cidades`;
  const sortHref = (key: string, dir: Dir) => {
    const q = new URLSearchParams({ ordem: key, dir });
    if (sel) q.set('cidade', sel.city.key);
    if (searchQuery) q.set('q', searchQuery);
    return `${tab}?${q.toString()}#ranking`;
  };
  const selectHref = (key: string) => {
    const q = new URLSearchParams({ cidade: key });
    if (sp.ordem) q.set('ordem', sp.ordem);
    if (sp.dir) q.set('dir', sp.dir);
    return `${tab}?${q.toString()}#selecao`;
  };
  const selPlayers = sel
    ? rows.filter((r) => cityByTp.get(r.tp_id)?.key === sel.city.key)
      .sort((a, b) => groupOrder.indexOf(a.pairing_group_name ?? '—') - groupOrder.indexOf(b.pairing_group_name ?? '—')
        || (placeByTp.get(a.tp_id)?.section ?? '').localeCompare(placeByTp.get(b.tp_id)?.section ?? '', 'pt-BR')
        || (placeByTp.get(a.tp_id)?.rank ?? 999) - (placeByTp.get(b.tp_id)?.rank ?? 999))
    : [];
  const selRated = selPlayers.filter((r) => (r.rating_tempo ?? 0) > 0);
  const selAvgRating = selRated.length ? Math.round(selRated.reduce((a, r) => a + (r.rating_tempo ?? 0), 0) / selRated.length) : null;
  const sortOptions = [
    ['posicao', 'Posição oficial', 'asc'], ['cidade', 'Nome da cidade', 'asc'], ['jogadores', 'Número de jogadores', 'desc'],
    ['podio', 'Jogadores no pódio', 'desc'], ['top10', 'Jogadores no top 10', 'desc'], ['pontos', 'Pontos totais', 'desc'],
    ['ptsjog', 'Pontos por jogador', 'desc'], ['aproveit', 'Aproveitamento', 'desc'], ['melhor', 'Melhor colocação', 'asc'],
  ].map(([key, label, dir]) => ({ key, label, href: sortHref(key, dir as Dir) }));
  const cityLabel = (c: CityStats) => (c.city.uf === tournament.state ? c.city.name : `${c.city.name}/${c.city.uf}`);

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-base font-bold text-gray-900 sm:text-lg dark:text-gray-100">O torneio em números</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
          {[
            ['Jogadores', String(rows.length)],
            ['Cidades', String(ranking.length)],
            ['Classificações', String(new Set([...placeByTp.values()].map((p) => p.section)).size || groupOrder.length)],
            ['Rodada', `${currentRoundNumber ?? (finished ? tournament.rounds_count : '–')} de ${tournament.rounds_count}`],
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
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              Maior delegação: <span className="font-semibold">{cityLabel(biggest)}</span> ({biggest.players} jogadores)
            </p>
          );
        })()}
      </section>

      {sel ? (
        <section
          id="selecao"
          className={isHostSel
            ? 'scroll-mt-24 overflow-hidden rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50 via-white to-yellow-50 shadow-sm dark:border-emerald-600 dark:from-emerald-950/40 dark:via-gray-900 dark:to-yellow-950/20'
            : 'scroll-mt-24 overflow-hidden rounded-2xl border-2 border-brand-300 bg-white shadow-sm dark:border-brand-800 dark:bg-gray-900'}
        >
          <div className="flex flex-col items-stretch gap-4 border-b border-emerald-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-emerald-900">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {cityLabel(sel)}
                {isHostSel && <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 align-middle text-[11px] font-semibold text-white">cidade-sede</span>}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {officialPos.get(sel.city.key)}º entre {ranking.length} cidades
                {!isHostSel && host && ranking.some((c) => c.city.key === host.key) && (
                  <> · <Link href={selectHref(host.key)} scroll={false} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">ver {host.name}</Link></>
                )}
              </p>
            </div>
            <CountryPicker
              slug={slug}
              tab="cidades"
              param="cidade"
              label="Ver cidade"
              current={sel.city.key}
              countries={[...ranking].sort((a, b) => a.city.name.localeCompare(b.city.name, 'pt-BR')).map((c) => ({ code: c.city.key, name: cityLabel(c), players: c.players }))}
              keepQuery={Object.fromEntries((['ordem', 'dir', 'q'] as const).filter((k) => sp[k]).map((k) => [k, sp[k]!]))}
            />
          </div>
          <div className="grid grid-cols-2 gap-px bg-emerald-100 sm:grid-cols-4 dark:bg-emerald-900/50">
            {([
              ['Jogadores', String(sel.players)],
              ['Pontos', formatScore(sel.points), `${(sel.points / sel.players).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por jogador`],
              ['Aproveitamento', pctText(cityWinRate(sel))],
              ['V / E / D', `${sel.wins} / ${sel.draws} / ${sel.losses}`],
              ['Melhor colocação', sel.best ? `${sel.best.rank}º de ${sel.best.size}` : '–', sel.best ? `${playerDisplayName(sel.best.player.full_name, sel.best.player.fide_name, locale)} · ${sel.best.group}` : undefined],
              ['Rating médio', selAvgRating ? String(selAvgRating) : '–'],
              ['No top 10', String(sel.top10)],
              ['No pódio', String(sel.podiums)],
            ] as [string, string, string?][]).map(([label, value, sub]) => (
              <div key={label} className="bg-white/80 px-2.5 py-3 sm:px-4 dark:bg-gray-900/70">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs dark:text-gray-400">{label}</p>
                <p className="text-lg font-bold tabular-nums text-gray-900 sm:text-xl dark:text-gray-100">{value}</p>
                {sub && <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">{sub}</p>}
              </div>
            ))}
          </div>
          <details className="border-t border-emerald-200 dark:border-emerald-900">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 sm:px-5 dark:text-brand-300 dark:hover:bg-brand-950/30">
              <span>Ver {sel.players} {sel.players === 1 ? 'jogador' : 'jogadores'} · {sel.city.name}</span>
              <span aria-hidden="true">▾</span>
            </summary>
            <ul className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
              {selPlayers.map((r) => (
                <li key={r.tp_id}>
                  <Link href={`/torneios/${slug}/jogadores/${r.tp_id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 sm:px-5 dark:hover:bg-gray-800/60">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{playerDisplayName(r.full_name, r.fide_name, locale)}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{placeByTp.get(r.tp_id)?.section ?? r.pairing_group_name ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-gray-800 dark:text-gray-200">{placeByTp.get(r.tp_id) ? `${placeByTp.get(r.tp_id)!.rank}º` : '–'}</span>
                      <span className="block text-xs text-gray-500">{formatScore(Number(r.points) || 0)} pts</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : (
        <p className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-800">
          Nenhum jogador com cidade informada neste torneio.
        </p>
      )}

      {ranking.length > 0 && (
        <section id="ranking" className="scroll-mt-24">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Desempenho por cidade</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Posição (#): jogadores no pódio da própria classificação (categoria), depois no top 10, depois pontos por jogador. Toque numa cidade para ver os números e os jogadores dela.
            </p>
          </div>
          <form action={`${tab}#ranking`} className="mb-3 flex flex-col gap-2 sm:flex-row">
            {(['ordem', 'dir', 'cidade'] as const).map((key) => sp[key] ? <input key={key} type="hidden" name={key} value={sp[key]} /> : null)}
            <label className="min-w-0 flex-1">
              <span className="sr-only">Buscar cidade</span>
              <input type="search" name="q" defaultValue={searchQuery} placeholder="Buscar cidade" className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
            </label>
            <button type="submit" className="min-h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Buscar cidade</button>
            {searchQuery && <Link href={`${tab}#ranking`} className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-brand-600 dark:text-brand-400">Limpar busca</Link>}
          </form>
          <CountryRankingSort current={ord} direction={ordDir} reverseHref={sortHref(ord, ordDir === 'asc' ? 'desc' : 'asc')} options={sortOptions} label="Ordenar cidades por" />
          <div className="mt-3 space-y-2 md:hidden">
            {sortedRanking.map((c) => {
              const isHost = host?.key === c.city.key;
              return (
                <Link key={c.city.key} href={selectHref(c.city.key)}
                  className={isHost
                    ? 'block rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3.5 dark:border-emerald-600 dark:bg-emerald-950/40'
                    : 'block rounded-xl border border-gray-200 bg-white p-3.5 dark:border-gray-800 dark:bg-gray-900'}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">{officialPos.get(c.city.key)}º</span>
                      <span className={isHost ? 'truncate font-bold text-emerald-800 dark:text-emerald-300' : 'truncate font-semibold text-gray-900 dark:text-gray-100'}>{cityLabel(c)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-400">Ver jogadores</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-1 text-center">
                    {[['Jogadores', String(c.players)], ['Pódio', String(c.podiums || '–')], ['Top 10', String(c.top10 || '–')], ['Pts/jog.', perPlayer(c)]].map(([label, value]) => (
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
                  <SortTh label="Cidade" sortKey="cidade" current={ord} dir={ordDir} defaultDir="asc" href={sortHref} className="px-3 py-2 font-semibold" />
                  <SortTh label="Jogadores" sortKey="jogadores" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                  <SortTh label="Pódio" sortKey="podio" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                  <SortTh label="Top 10" sortKey="top10" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                  <SortTh label="Pontos" sortKey="pontos" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                  <SortTh label="Pts/jogador" sortKey="ptsjog" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                  <SortTh label="Aproveitamento" sortKey="aproveit" current={ord} dir={ordDir} defaultDir="desc" href={sortHref} className="px-3 py-2 text-center font-semibold" />
                  <SortTh label="Melhor colocação" sortKey="melhor" current={ord} dir={ordDir} defaultDir="asc" href={sortHref} className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {sortedRanking.map((c) => {
                  const isHost = host?.key === c.city.key;
                  return (
                    <tr key={c.city.key} className={isHost ? 'border-y-2 border-emerald-500 bg-emerald-50 font-semibold dark:border-emerald-600 dark:bg-emerald-950/40' : 'border-b border-gray-100 dark:border-gray-800/60'}>
                      <td className="px-3 py-2 tabular-nums text-gray-500">{officialPos.get(c.city.key)}</td>
                      <td className="px-3 py-2">
                        <Link href={selectHref(c.city.key)} title="Ver os jogadores desta cidade"
                          className={(isHost ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200') + ' hover:text-brand-600 hover:underline dark:hover:text-brand-400' + (c.city.key === sel?.city.key ? ' underline' : '')}>
                          {cityLabel(c)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.players}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.podiums || '–'}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{c.top10 || '–'}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{formatScore(c.points)}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{perPlayer(c)}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{pctText(cityWinRate(c))}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{c.best ? `${c.best.rank}º de ${c.best.size} · ${c.best.group}` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Cidade do cadastro de cada jogador. {withoutCity > 0 && `${withoutCity} ${withoutCity === 1 ? 'jogador sem cidade informada não entra' : 'jogadores sem cidade informada não entram'} na tabela. `}
            Aproveitamento: pontos nas partidas disputadas (vitória 1, empate ½), sem contar byes. Pódio, top 10 e melhor colocação contam a posição de cada jogador na própria classificação (categoria), como na aba Classificação.
          </p>
        </section>
      )}
    </div>
  );
}
