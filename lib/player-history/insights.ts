// Estatísticas avançadas do perfil do jogador (premium) — funções puras sobre o
// histórico já carregado. W.O. fica fora (não é partida jogada).

import { wasPlayed, type HGame } from './types';

export interface Tally {
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  /** Aproveitamento 0–100; null sem partidas. */
  pct: number | null;
}

const empty = (): Tally => ({ played: 0, points: 0, wins: 0, draws: 0, losses: 0, pct: null });

function add(t: Tally, g: HGame): Tally {
  t.played += 1;
  if (g.outcome === 'win') { t.wins += 1; t.points += 1; }
  else if (g.outcome === 'draw') { t.draws += 1; t.points += 0.5; }
  else t.losses += 1;
  t.pct = (t.points / t.played) * 100;
  return t;
}

export function tally(games: HGame[]): Tally {
  return games.filter(wasPlayed).reduce(add, empty());
}

export function byColor(games: HGame[]): { white: Tally; black: Tally } {
  const played = games.filter(wasPlayed);
  return { white: tally(played.filter((g) => g.color === 'white')), black: tally(played.filter((g) => g.color === 'black')) };
}

/** Por ritmo, na ordem Clássico, Rápido, Blitz, Bullet, depois sem ritmo. */
export function byTimeControl(games: HGame[]): Array<{ label: string; tally: Tally }> {
  const order = ['Clássico', 'Rápido', 'Blitz', 'Bullet'];
  const groups = new Map<string, HGame[]>();
  for (const g of games.filter(wasPlayed)) {
    const k = g.timeControl ?? 'Sem ritmo informado';
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([label, list]) => ({ label, tally: tally(list) }));
}

export type StrengthBand = 'stronger' | 'similar' | 'weaker';
export const STRENGTH_LABEL: Record<StrengthBand, string> = {
  stronger: 'Adversário 100+ pontos acima',
  similar: 'Adversário de força parecida (±99)',
  weaker: 'Adversário 100+ pontos abaixo',
};

/** Só partidas em que os dois ratings são conhecidos. */
export function byStrength(games: HGame[]): { bands: Record<StrengthBand, Tally>; rated: number } {
  const bands: Record<StrengthBand, Tally> = { stronger: empty(), similar: empty(), weaker: empty() };
  let rated = 0;
  for (const g of games.filter(wasPlayed)) {
    if (!g.myRating || !g.opp.rating) continue;
    rated += 1;
    const diff = g.opp.rating - g.myRating;
    add(bands[diff >= 100 ? 'stronger' : diff <= -100 ? 'weaker' : 'similar'], g);
  }
  return { bands, rated };
}

/**
 * Diferença de performance pela fórmula logística do Elo (aproximação da tabela
 * FIDE), limitada a ±800 — 100% ou 0% não viram infinito.
 */
export function performanceDelta(score: number): number {
  const p = Math.min(Math.max(score, 0), 1);
  if (p >= 1) return 800;
  if (p <= 0) return -800;
  return Math.max(-800, Math.min(800, Math.round(400 * Math.log10(p / (1 - p)))));
}

export interface TournamentPerformance {
  tournamentId: string;
  name: string;
  date: string;
  played: number;
  points: number;
  /** Média dos adversários com rating; null se nenhum tinha. */
  avgOpponent: number | null;
  /** Performance: média dos adversários + delta do aproveitamento contra eles. */
  performance: number | null;
  /** Rating do jogador no torneio, quando conhecido. */
  myRating: number | null;
}

export function tournamentPerformances(games: HGame[]): TournamentPerformance[] {
  const groups = new Map<string, HGame[]>();
  for (const g of games.filter(wasPlayed)) groups.set(g.tournamentId, [...(groups.get(g.tournamentId) ?? []), g]);
  return [...groups.values()].map((list) => {
    const first = list[0];
    const t = tally(list);
    const rated = list.filter((g) => g.opp.rating);
    const ratedPoints = tally(rated).points;
    const avgOpponent = rated.length ? Math.round(rated.reduce((s, g) => s + (g.opp.rating ?? 0), 0) / rated.length) : null;
    return {
      tournamentId: first.tournamentId,
      name: first.tournamentName,
      date: first.date,
      played: t.played,
      points: t.points,
      avgOpponent,
      performance: avgOpponent !== null ? avgOpponent + performanceDelta(ratedPoints / rated.length) : null,
      myRating: list.find((g) => g.myRating)?.myRating ?? null,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Ordem cronológica das partidas jogadas: data do torneio, depois rodada. */
function chronological(games: HGame[]): HGame[] {
  return games.filter(wasPlayed).sort((a, b) => a.date.localeCompare(b.date) || a.tournamentId.localeCompare(b.tournamentId) || a.round - b.round);
}

export function streaks(games: HGame[]): { currentUnbeaten: number; bestUnbeaten: number; bestWins: number } {
  let currentUnbeaten = 0, bestUnbeaten = 0, wins = 0, bestWins = 0;
  for (const g of chronological(games)) {
    if (g.outcome === 'loss') { currentUnbeaten = 0; wins = 0; continue; }
    currentUnbeaten += 1;
    bestUnbeaten = Math.max(bestUnbeaten, currentUnbeaten);
    wins = g.outcome === 'win' ? wins + 1 : 0;
    bestWins = Math.max(bestWins, wins);
  }
  return { currentUnbeaten, bestUnbeaten, bestWins };
}
