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
  /** Melhor colocação na própria seção (posição absoluta; empate: seção maior). */
  best: { rank: number; size: number; group: string; player: StandingRow } | null;
}

export interface CityRanking {
  ranking: CityStats[];
  /** tp_id -> cidade (só quem tem cidade reconhecida). */
  cityByTp: Map<string, CityRef>;
  withoutCity: number;
}

/**
 * Ordem oficial: jogadores no pódio da seção, depois no top 10, depois pontos por
 * jogador — a mesma régua da aba "Por país".
 */
export function buildCityRanking(
  rows: StandingRow[],
  places: Map<string, { city: string | null; state: string | null }>,
  tournamentUf?: string | null,
): CityRanking {
  const groupSize = new Map<string, number>();
  for (const r of rows) groupSize.set(r.pairing_group_name ?? '—', (groupSize.get(r.pairing_group_name ?? '—') ?? 0) + 1);
  const cityByTp = new Map<string, CityRef>();
  const stats = new Map<string, CityStats>();
  let withoutCity = 0;
  for (const r of rows) {
    const place = places.get(r.tp_id);
    const city = resolveCity(place?.city, place?.state ?? r.state, tournamentUf);
    if (!city) { withoutCity++; continue; }
    cityByTp.set(r.tp_id, city);
    const c = stats.get(city.key) ?? { city, players: 0, points: 0, wins: 0, draws: 0, losses: 0, podiums: 0, top10: 0, best: null };
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
      if (!c.best || r.rank < c.best.rank || (r.rank === c.best.rank && size > c.best.size)) c.best = { rank: r.rank, size, group, player: r };
    }
    stats.set(city.key, c);
  }
  const ranking = [...stats.values()].sort((a, b) =>
    b.podiums - a.podiums || b.top10 - a.top10 || b.points / b.players - a.points / a.players || a.city.name.localeCompare(b.city.name, 'pt-BR'),
  );
  return { ranking, cityByTp, withoutCity };
}

export const cityWinRate = (c: Pick<CityStats, 'wins' | 'draws' | 'losses'>) => {
  const games = c.wins + c.draws + c.losses;
  return games ? (c.wins + c.draws / 2) / games : 0;
};
