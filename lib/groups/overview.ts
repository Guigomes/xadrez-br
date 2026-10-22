// Regras puras do painel de grupo (clube, escola, treinador) — testáveis.

export type GroupKind = 'club' | 'school' | 'coach';

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  club: 'Clube',
  school: 'Escola',
  coach: 'Alunos (treinador)',
};

export interface GroupMemberRow {
  player_id: string;
  full_name: string;
  title: string | null;
  cbx_id: string | null;
  state: string | null;
  birth_year: number | null;
  rating_std: number | null;
  rating_rpd: number | null;
  rating_blz: number | null;
  note: string | null;
  games: number;
  points: number | string;
  pgn_games: number;
  last_tournament_name: string | null;
  last_tournament_date: string | null;
}

export type SortKey = 'std' | 'rpd' | 'blz' | 'games' | 'pct' | 'name';

export const SORT_LABEL: Record<SortKey, string> = {
  std: 'Rating clássico', rpd: 'Rating rápido', blz: 'Rating blitz', games: 'Mais ativos', pct: 'Melhor aproveitamento', name: 'Nome',
};

/** Aproveitamento 0–100 no período, null sem partidas. */
export function memberPct(m: Pick<GroupMemberRow, 'games' | 'points'>): number | null {
  return m.games > 0 ? (Number(m.points) / m.games) * 100 : null;
}

export function memberAge(birthYear: number | null, today = new Date()): number | null {
  return birthYear ? today.getFullYear() - birthYear : null;
}

/**
 * Ranking interno. Sem valor vai para o fim (nunca à frente de quem tem);
 * empate desempata pelo nome. Aproveitamento exige ao menos `minGames` partidas
 * para não premiar quem jogou uma só.
 */
export function sortMembers(rows: GroupMemberRow[], key: SortKey, minGames = 3): GroupMemberRow[] {
  const value = (m: GroupMemberRow): number | null => {
    switch (key) {
      case 'std': return m.rating_std;
      case 'rpd': return m.rating_rpd;
      case 'blz': return m.rating_blz;
      case 'games': return m.games;
      case 'pct': return m.games >= minGames ? memberPct(m) : null;
      default: return null;
    }
  };
  return [...rows].sort((a, b) => {
    if (key !== 'name') {
      const va = value(a), vb = value(b);
      if (va !== vb) {
        if (va === null) return 1;
        if (vb === null) return -1;
        return vb - va;
      }
    }
    return a.full_name.localeCompare(b.full_name, 'pt-BR');
  });
}

/** Resumo do grupo para o topo do painel. */
export function groupSummary(rows: GroupMemberRow[]) {
  const active = rows.filter((m) => m.games > 0);
  const rated = rows.filter((m) => m.rating_std);
  return {
    members: rows.length,
    active: active.length,
    games: rows.reduce((s, m) => s + m.games, 0),
    pgnGames: rows.reduce((s, m) => s + m.pgn_games, 0),
    avgStd: rated.length ? Math.round(rated.reduce((s, m) => s + (m.rating_std ?? 0), 0) / rated.length) : null,
  };
}
