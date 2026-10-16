/**
 * Acessos por aba do torneio, pro painel de acessos do dev. Tudo calculado a partir dos
 * eventos de site_access_events já carregados (30 dias) — sem consulta nova.
 */

export type TournamentTabKey =
  | 'overview'
  | 'participants'
  | 'rounds'
  | 'standings'
  | 'live'
  | 'countries'
  | 'player'
  | 'register'
  | 'statistics'
  | 'tv'
  | 'other';

export const TOURNAMENT_TAB_LABELS: Record<TournamentTabKey, string> = {
  overview: 'Visão geral',
  participants: 'Participantes',
  rounds: 'Rodadas',
  standings: 'Classificação',
  live: 'Acompanhe ao Vivo',
  countries: 'Por país',
  player: 'Ficha do jogador',
  register: 'Inscrição',
  statistics: 'Estatísticas',
  tv: 'Painel para TV',
  other: 'Outras',
};

/** Ordem de exibição (a mesma das abas na página do torneio). */
export const TOURNAMENT_TAB_ORDER: TournamentTabKey[] = [
  'overview', 'participants', 'rounds', 'standings', 'live', 'countries', 'player', 'register', 'statistics', 'tv', 'other',
];

/**
 * Cidades de datacenter do Google (robô de busca / AdSense). Heurística: o contador não
 * guarda o user-agent, então o robô aparece como um aparelho novo a cada visita, sempre
 * nessas cidades. Fica fora da contagem por aba pra não inflar o "público".
 */
const CRAWLER_CITIES = new Set(['The Dalles', 'Moses Lake', 'Council Bluffs', 'Lenoir', 'Pryor', 'Midlothian']);

export function isLikelyCrawler(city: string | null | undefined): boolean {
  return !!city && CRAWLER_CITIES.has(city);
}

/** "/es/torneios/x/rounds/3" → { slug: 'x', tab: 'rounds' }; fora de torneio → null. */
export function classifyTournamentPath(path: string): { slug: string; tab: TournamentTabKey } | null {
  const clean = path.split(/[?#]/)[0].replace(/^\/(?:es|en)(?=\/)/, '');
  const m = clean.match(/^\/torneios\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return null;
  const [, slug, section] = m;
  const tab: TournamentTabKey =
    !section ? 'overview'
    : section === 'participants' ? 'participants'
    : section === 'rounds' ? 'rounds'
    : section === 'standings' ? 'standings'
    : section === 'ao-vivo' ? 'live'
    : section === 'paises' ? 'countries'
    : section === 'players' ? 'player'
    : section === 'register' ? 'register'
    : section === 'statistics' ? 'statistics'
    : section === 'painel' ? 'tv'
    : 'other';
  return { slug, tab };
}

export interface TabStatRow {
  /** slug do torneio, ou ALL_TOURNAMENTS pra soma de todos. */
  slug: string;
  tab: TournamentTabKey;
  views24h: number;
  views7d: number;
  views30d: number;
  /** Aparelhos distintos em 30 dias (não dá pra somar entre torneios — por isso a linha ALL é calculada à parte). */
  devices30d: number;
}

export const ALL_TOURNAMENTS = '__all__';

export function aggregateTabStats(
  events: Array<{ device_id: string; path: string; visited_at: string; city: string | null }>,
  excludeDeviceIds: Set<string>,
  now: number = Date.now(),
): TabStatRow[] {
  const since24h = now - 24 * 60 * 60 * 1000;
  const since7d = now - 7 * 24 * 60 * 60 * 1000;
  const rows = new Map<string, TabStatRow & { devices: Set<string> }>();

  const bump = (slug: string, tab: TournamentTabKey, deviceId: string, at: number) => {
    const key = `${slug}|${tab}`;
    let row = rows.get(key);
    if (!row) {
      row = { slug, tab, views24h: 0, views7d: 0, views30d: 0, devices30d: 0, devices: new Set() };
      rows.set(key, row);
    }
    row.views30d++;
    if (at >= since7d) row.views7d++;
    if (at >= since24h) row.views24h++;
    row.devices.add(deviceId);
  };

  for (const e of events) {
    if (excludeDeviceIds.has(e.device_id) || isLikelyCrawler(e.city)) continue;
    const hit = classifyTournamentPath(e.path);
    if (!hit) continue;
    const at = Date.parse(e.visited_at);
    bump(hit.slug, hit.tab, e.device_id, at);
    bump(ALL_TOURNAMENTS, hit.tab, e.device_id, at);
  }

  return [...rows.values()].map(({ devices, ...row }) => ({ ...row, devices30d: devices.size }));
}
