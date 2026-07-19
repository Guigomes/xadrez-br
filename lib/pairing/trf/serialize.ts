// Serializa o estado de um grupo em TRF(bx) para o bbpPairings (modo pairing).
// A engine valida estritamente pontos × resultados — erros aqui viram exit 3.
import { COL, ROUND_WIDTH, BYE_CODE } from './constants';
import type { GameResult, ByeKind, InitialColor, PlayerSex } from '@/types/database';

export interface TrfPlayer {
  tpId: string;
  startno: number; // initial_ranking, 1..N contíguo
  fullName: string;
  sex: PlayerSex | null;
  rating: number | null;
  federation: string | null;
  fideId: string | null;
  birthYear: number | null;
  status: 'active' | 'withdrawn' | 'absent';
  joinedAtRound: number;
}

export interface TrfGame {
  roundNumber: number;
  whiteTpId: string;
  blackTpId: string | null;
  result: GameResult;
  isBye: boolean;
  byeKind: ByeKind | null;
  whitePoints: number | null;
  blackPoints: number | null;
}

export interface TrfState {
  tournamentName: string;
  roundsTotal: number;
  initialColor: InitialColor;
  requestedByeScore: number; // 0.5 | 0
  targetRound: number;       // rodada a parear
  players: TrfPlayer[];
  games: TrfGame[];          // histórico das rodadas < targetRound
  requestedByeTpIds: Set<string>; // byes solicitados para targetRound
}

function put(line: string[], start: number, end: number, text: string, align: 'left' | 'right') {
  const width = end - start + 1;
  const t = text.slice(0, width);
  const padded = align === 'left' ? t.padEnd(width) : t.padStart(width);
  for (let i = 0; i < width; i++) line[start - 1 + i] = padded[i];
}

function fmtPoints(p: number): string {
  return p.toFixed(1);
}

interface Cell { opp: string; color: string; result: string }

function cellsForPlayer(p: TrfPlayer, state: TrfState, startnoByTp: Map<string, number>): Cell[] {
  const cells: Cell[] = [];
  for (let r = 1; r < state.targetRound; r++) {
    const g = state.games.find(
      (g) => g.roundNumber === r && (g.whiteTpId === p.tpId || g.blackTpId === p.tpId),
    );
    if (!g) {
      // sem registro na rodada (ex.: dado legado) — ausência de 0 pontos
      cells.push({ opp: '0000', color: '-', result: 'Z' });
      continue;
    }
    if (g.isBye) {
      cells.push({ opp: '0000', color: '-', result: BYE_CODE[g.byeKind ?? 'pairing'] });
      continue;
    }
    const isWhite = g.whiteTpId === p.tpId;
    const oppTp = isWhite ? g.blackTpId : g.whiteTpId;
    const opp = String(startnoByTp.get(oppTp!) ?? 0).padStart(4);
    switch (g.result) {
      case '1-0':      cells.push({ opp, color: isWhite ? 'w' : 'b', result: isWhite ? '1' : '0' }); break;
      case '0-1':      cells.push({ opp, color: isWhite ? 'w' : 'b', result: isWhite ? '0' : '1' }); break;
      case '1/2-1/2':  cells.push({ opp, color: isWhite ? 'w' : 'b', result: '=' }); break;
      case 'forfeit_white': cells.push({ opp, color: '-', result: isWhite ? '-' : '+' }); break;
      case 'forfeit_black': cells.push({ opp, color: '-', result: isWhite ? '+' : '-' }); break;
      case 'double_forfeit': cells.push({ opp: '0000', color: '-', result: '-' }); break;
      default:
        throw new Error(`Resultado pendente na rodada ${r} (mesa com '${g.result}') — feche a rodada antes de parear.`);
    }
  }

  // Coluna extra da rodada-alvo: só para quem NÃO joga.
  const excluded =
    p.status !== 'active' ||
    p.joinedAtRound > state.targetRound ||
    state.requestedByeTpIds.has(p.tpId);
  if (excluded) {
    const code = state.requestedByeTpIds.has(p.tpId) && p.status === 'active'
      ? (state.requestedByeScore === 0.5 ? 'H' : 'Z')
      : 'Z';
    cells.push({ opp: '0000', color: '-', result: code });
  }
  return cells;
}

function pointsForPlayer(p: TrfPlayer, state: TrfState): number {
  let pts = 0;
  for (const g of state.games) {
    if (g.roundNumber >= state.targetRound) continue;
    if (g.whiteTpId === p.tpId) pts += Number(g.whitePoints ?? 0);
    else if (g.blackTpId === p.tpId) pts += Number(g.blackPoints ?? 0);
  }
  // bye solicitado da rodada-alvo entra nos pontos (a engine exige)
  if (p.status === 'active' && state.requestedByeTpIds.has(p.tpId)) {
    pts += state.requestedByeScore;
  }
  return pts;
}

export function serializeForPairing(state: TrfState): string {
  const sorted = [...state.players].sort((a, b) => a.startno - b.startno);
  // startnos 1..N contíguos
  sorted.forEach((p, i) => {
    if (p.startno !== i + 1) {
      throw new Error(`Ranking inicial inválido: esperado ${i + 1}, encontrado ${p.startno} (${p.fullName}). Gere o ranking inicial do grupo.`);
    }
  });
  const startnoByTp = new Map(state.players.map((p) => [p.tpId, p.startno]));

  const lines: string[] = [
    `012 ${state.tournamentName}`,
    `XXR ${state.roundsTotal}`,
    `XXC ${state.initialColor}`,
  ];

  for (const p of sorted) {
    const cells = cellsForPlayer(p, state, startnoByTp);
    const lastCol = COL.roundBase + ROUND_WIDTH * (cells.length - 1) + 7;
    const line: string[] = new Array(Math.max(lastCol, COL.rank[1])).fill(' ');
    put(line, 1, 3, '001', 'left');
    put(line, COL.startno[0], COL.startno[1], String(p.startno), 'right');
    put(line, COL.sex[0], COL.sex[1], p.sex ?? 'm', 'left');
    put(line, COL.name[0], COL.name[1], p.fullName, 'left');
    if (p.rating != null) put(line, COL.rating[0], COL.rating[1], String(p.rating), 'right');
    if (p.federation) put(line, COL.federation[0], COL.federation[1], p.federation, 'left');
    if (p.fideId) put(line, COL.fideId[0], COL.fideId[1], p.fideId, 'right');
    if (p.birthYear != null) put(line, COL.birth[0], COL.birth[1], `${p.birthYear}/00/00`, 'left');
    put(line, COL.points[0], COL.points[1], fmtPoints(pointsForPlayer(p, state)), 'right');
    cells.forEach((c, i) => {
      const base = COL.roundBase + ROUND_WIDTH * i;
      put(line, base, base + 3, c.opp.trim(), 'right');
      put(line, base + 5, base + 5, c.color, 'left');
      put(line, base + 7, base + 7, c.result, 'left');
    });
    lines.push(line.join('').trimEnd());
  }
  return lines.join('\n') + '\n';
}
