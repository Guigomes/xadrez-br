/*
 * Gambito Lite — visão do árbitro, calculada do backup que o celular do organizador enviou.
 * Puro (sem banco) para ser testado: quais mesas da rodada atual são deste árbitro e se ele pode
 * lançar resultado nelas.
 */

export const ARBITER_RESULTS = ['*', '1-0', '0-1', '1/2-1/2', 'forfeit_white', 'forfeit_black', 'double_forfeit'] as const;
export type ArbiterResult = (typeof ARBITER_RESULTS)[number];

type Player = { id: string; name: string; club?: string | null; rating?: number | null };
type Round = { id: string; number: number; finished: boolean };
type Game = { id: string; roundId: string; board?: number | null; whiteId: string; blackId?: string | null; result: string; reportedBy?: string | null };
type Arbiter = { id: string; name: string; email: string };
type BoardArbiter = { roundNumber: number; board: number; arbiterId: string };

export type ArbiterBackup = {
  tournament: { id: string; name: string; roundsTotal: number };
  players: Player[];
  rounds: Round[];
  games: Game[];
  arbiters?: Arbiter[];
  boardArbiters?: BoardArbiter[];
};

export interface ArbiterBoard {
  gameId: string;
  board: number;
  white: { name: string; club: string | null; rating: number | null };
  black: { name: string; club: string | null; rating: number | null };
  /** Resultado no aparelho do organizador (o que vale). */
  result: string;
  reportedBy: string | null;
}

export interface ArbiterView {
  tournamentId: string;
  tournamentName: string;
  roundsTotal: number;
  arbiterName: string;
  /** Rodada atual (a última gerada); null se o torneio ainda não começou. */
  round: { number: number; finished: boolean } | null;
  boards: ArbiterBoard[];
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Árbitro do torneio com este e-mail, ou null. */
export function findArbiter(b: ArbiterBackup, email: string): Arbiter | null {
  const e = normalizeEmail(email);
  return (b.arbiters ?? []).find((a) => normalizeEmail(a.email) === e) ?? null;
}

/** Mesas da rodada atual atribuídas ao árbitro (null se o e-mail não é árbitro deste torneio). */
export function arbiterView(b: ArbiterBackup, email: string): ArbiterView | null {
  const arbiter = findArbiter(b, email);
  if (!arbiter) return null;
  const round = [...b.rounds].sort((x, y) => y.number - x.number)[0] ?? null;
  const players = new Map(b.players.map((p) => [p.id, p]));
  const side = (id: string | null | undefined) => {
    const p = id ? players.get(id) : undefined;
    return { name: p?.name ?? '?', club: p?.club ?? null, rating: p?.rating ?? null };
  };
  let boards: ArbiterBoard[] = [];
  if (round) {
    const mine = new Set(
      (b.boardArbiters ?? []).filter((ba) => ba.roundNumber === round.number && ba.arbiterId === arbiter.id).map((ba) => ba.board),
    );
    boards = b.games
      .filter((g) => g.roundId === round.id && g.board != null && g.blackId != null && mine.has(g.board))
      .sort((x, y) => (x.board ?? 0) - (y.board ?? 0))
      .map((g) => ({
        gameId: g.id,
        board: g.board as number,
        white: side(g.whiteId),
        black: side(g.blackId),
        result: g.result,
        reportedBy: g.reportedBy ?? null,
      }));
  }
  return {
    tournamentId: b.tournament.id,
    tournamentName: b.tournament.name,
    roundsTotal: b.tournament.roundsTotal,
    arbiterName: arbiter.name,
    round: round ? { number: round.number, finished: round.finished } : null,
    boards,
  };
}

/**
 * O árbitro pode lançar nesta mesa? Só nas mesas dele, na rodada atual, ainda aberta.
 * Devolve a mesa ou a mensagem de recusa.
 */
export function canSubmit(view: ArbiterView, gameId: string): { board: ArbiterBoard } | { error: string } {
  if (!view.round) return { error: 'O torneio ainda não começou.' };
  if (view.round.finished) return { error: `A rodada ${view.round.number} já foi encerrada pelo organizador.` };
  const board = view.boards.find((x) => x.gameId === gameId);
  if (!board) return { error: 'Esta mesa não está atribuída a você nesta rodada.' };
  return { board };
}

/** Resultado como aparece no aviso ("1–0", "W.O. das brancas"…). */
export function resultLabel(code: string): string {
  switch (code) {
    case '1-0': return '1–0';
    case '0-1': return '0–1';
    case '1/2-1/2': return '½–½';
    case 'forfeit_white': return 'W.O. das brancas';
    case 'forfeit_black': return 'W.O. das pretas';
    case 'double_forfeit': return 'W.O. duplo';
    case '*': return 'sem resultado';
    default: return code;
  }
}

/**
 * Rodada nova no envio (comparando com o backup anterior): mesas de cada árbitro nela, por
 * e-mail. Vazio se não surgiu rodada nova.
 */
export function newRoundAssignments(prevRoundCount: number, b: ArbiterBackup): { round: number; byEmail: Map<string, number[]> } | null {
  const latest = Math.max(0, ...b.rounds.map((r) => r.number));
  if (latest <= prevRoundCount) return null;
  const emailById = new Map((b.arbiters ?? []).map((a) => [a.id, normalizeEmail(a.email)]));
  const byEmail = new Map<string, number[]>();
  for (const ba of b.boardArbiters ?? []) {
    if (ba.roundNumber !== latest) continue;
    const email = emailById.get(ba.arbiterId);
    if (!email) continue;
    byEmail.set(email, [...(byEmail.get(email) ?? []), ba.board].sort((x, y) => x - y));
  }
  return { round: latest, byEmail };
}

/** "1, 2 e 5" */
export function boardsText(boards: number[]): string {
  if (boards.length <= 1) return boards.join('');
  return `${boards.slice(0, -1).join(', ')} e ${boards[boards.length - 1]}`;
}
