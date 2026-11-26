import municipiosPorUf from '@/lib/data/municipios-br.json';
import type { StandingRow } from '@/types/database';

/**
 * Aba "Por cidade" (tournaments.show_city_ranking): agrega a classificação pela cidade
 * dos jogadores (players.city). O campo cidade vem de fontes misturadas (no chess-results,
 * "Clube/Cidade" traz escola tanto quanto cidade), então só conta como cidade o texto que
 * bate com um município do IBGE (lista em lib/data/municipios-br.json); o resto vai para
 * "sem cidade informada".
 */

export interface CityRef {
  /** Chave estável (sem acento, minúsculas) usada na URL. */
  key: string;
  name: string;
  uf: string;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** nome normalizado -> municípios com esse nome (pode haver vários em UFs diferentes). */
const byName = new Map<string, CityRef[]>();
for (const [uf, list] of Object.entries(municipiosPorUf as Record<string, string>)) {
  for (const name of list.split('|')) {
    const k = norm(name);
    byName.set(k, [...(byName.get(k) ?? []), { key: '', name, uf }]);
  }
}

export function cityKey(name: string, uf: string): string {
  return `${norm(name).replace(/ /g, '-')}-${uf.toLowerCase()}`;
}

/**
 * Município do texto de cidade. UF do jogador desempata homônimos; sem ela, vale o
 * município da UF do torneio; senão, só se o nome existir numa UF só.
 */
export function resolveCity(raw: string | null | undefined, playerUf?: string | null, tournamentUf?: string | null): CityRef | null {
  if (!raw) return null;
  const k = norm(raw).replace(/ (ms|mato grosso do sul)$/, '');
  const hits = byName.get(k);
  if (!hits?.length) return null;
  const pick = hits.find((h) => h.uf === playerUf) ?? hits.find((h) => h.uf === tournamentUf) ?? (hits.length === 1 ? hits[0] : null);
  return pick ? { ...pick, key: cityKey(pick.name, pick.uf) } : null;
}

export interface CityStats {
  city: CityRef;
  players: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  podiums: number;
  top10: number;
  /** Melhor colocação na própria classificação (posição absoluta; empate: classificação maior). */
  best: { rank: number; size: number; group: string; player: StandingRow } | null;
}

export interface CityRanking {
  ranking: CityStats[];
  /** tp_id -> posição na própria classificação (categoria; sem categoria, o grupo) e o nome dela. */
  placeByTp: Map<string, { rank: number; size: number; section: string }>;
  /** tp_id -> cidade (só quem tem cidade reconhecida). */
  cityByTp: Map<string, CityRef>;
  withoutCity: number;
}

/**
 * Posição de cada jogador na PRÓPRIA classificação, como na aba Classificação: dentro do
 * grupo, quem tem categoria é renumerado só entre os da mesma categoria (1, 2, 3...), na
 * ordem que a RPC devolve (grupo, posição). Sem categoria, vale a posição no grupo.
 * Pedido do dono: o pódio do festival é por classificação (Sub-07 Masc etc.), não do
 * grupo inteiro (que na 1ª etapa juntava Sub-07/09/11).
 */
/**
 * Nome da classificação do jogador: a categoria; sem categoria, o grupo. Quando a
 * categoria não traz o gênero e o grupo traz (1ª etapa do Festival: categoria "U15" no
 * grupo "Sub-13/15/17 Fem"), junta os dois: "U15 Fem".
 */
export function classificationLabel(r: Pick<StandingRow, 'category_name' | 'pairing_group_name'>): string {
  const cat = r.category_name?.trim();
  const group = r.pairing_group_name?.trim() ?? '';
  if (!cat) return group || '—';
  if (/fem|masc/i.test(cat)) return cat;
  const gender = /fem/i.test(group) ? 'Fem' : /masc/i.test(group) ? 'Masc' : '';
  return gender ? `${cat} ${gender}` : cat;
}

export function classificationPlaces(rows: StandingRow[]): Map<string, { rank: number; size: number; section: string }> {
  const keyOf = (r: StandingRow) => `${r.pairing_group_id ?? r.pairing_group_name ?? '—'}:${r.category_id ?? ''}`;
  const size = new Map<string, number>();
  for (const r of rows) if (r.rank != null) size.set(keyOf(r), (size.get(keyOf(r)) ?? 0) + 1);
  const counter = new Map<string, number>();
  const out = new Map<string, { rank: number; size: number; section: string }>();
  for (const r of rows) {
    if (r.rank == null) continue;
    const k = keyOf(r);
    const rank = r.category_id ? (counter.get(k) ?? 0) + 1 : r.rank;
    if (r.category_id) counter.set(k, rank);
    out.set(r.tp_id, { rank, size: size.get(k) ?? 1, section: classificationLabel(r) });
  }
  return out;
}

/**
 * Ordem oficial: jogadores no pódio da própria classificação, depois no top 10, depois
 * pontos por jogador — a régua da aba "Por país", com a posição por classificação.
 */
export function buildCityRanking(
  rows: StandingRow[],
  places: Map<string, { city: string | null; state: string | null }>,
  tournamentUf?: string | null,
): CityRanking {
  const placeByTp = classificationPlaces(rows);
  const cityByTp = new Map<string, CityRef>();
  const stats = new Map<string, CityStats>();
  let withoutCity = 0;
  for (const r of rows) {
    const home = places.get(r.tp_id);
    const city = resolveCity(home?.city, home?.state ?? r.state, tournamentUf);
    if (!city) { withoutCity++; continue; }
    cityByTp.set(r.tp_id, city);
    const c = stats.get(city.key) ?? { city, players: 0, points: 0, wins: 0, draws: 0, losses: 0, podiums: 0, top10: 0, best: null };
    c.players++;
    c.points += Number(r.points) || 0;
    c.wins += r.wins ?? 0;
    c.draws += r.draws ?? 0;
    c.losses += r.losses ?? 0;
    const place = placeByTp.get(r.tp_id);
    if (place) {
      if (place.rank <= 3) c.podiums++;
      if (place.rank <= 10) c.top10++;
      if (!c.best || place.rank < c.best.rank || (place.rank === c.best.rank && place.size > c.best.size)) {
        c.best = { rank: place.rank, size: place.size, group: place.section, player: r };
      }
    }
    stats.set(city.key, c);
  }
  const ranking = [...stats.values()].sort((a, b) =>
    b.podiums - a.podiums || b.top10 - a.top10 || b.points / b.players - a.points / a.players || a.city.name.localeCompare(b.city.name, 'pt-BR'),
  );
  return { ranking, placeByTp, cityByTp, withoutCity };
}

export const cityWinRate = (c: Pick<CityStats, 'wins' | 'draws' | 'losses'>) => {
  const games = c.wins + c.draws + c.losses;
  return games ? (c.wins + c.draws / 2) / games : 0;
};
