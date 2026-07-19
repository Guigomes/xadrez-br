// Avisos do editor de rascunho (design §6). Nunca bloqueiam — informam.
import type { GameResult, ByeKind } from '@/types/database';

export interface HistoryGame {
  roundNumber: number;
  whiteTpId: string;
  blackTpId: string | null;
  result: GameResult;
  isBye: boolean;
  byeKind: ByeKind | null;
  whitePoints: number | null;
  blackPoints: number | null;
}

export interface DraftBoard {
  pairingId: string;
  board: number | null;
  whiteTpId: string;
  blackTpId: string | null;
  byeKind: ByeKind | null;
  manualOverride: boolean;
}

export type PairingWarning =
  | { code: 'REMATCH'; board: number | null; tpIds: [string, string] }
  | { code: 'COLOR_STREAK'; board: number | null; tpId: string; color: 'w' | 'b' }
  | { code: 'COLOR_IMBALANCE'; board: number | null; tpId: string; diff: number }
  | { code: 'SCORE_GAP'; board: number | null; gap: number }
  | { code: 'SECOND_PAIRING_BYE'; tpId: string }
  | { code: 'MANUAL_OVERRIDE'; board: number | null };

export function computeWarnings(history: HistoryGame[], draft: DraftBoard[]): PairingWarning[] {
  const warnings: PairingWarning[] = [];

  const scores = new Map<string, number>();
  const colorSeq = new Map<string, ('w' | 'b')[]>();
  const opponents = new Map<string, Set<string>>();
  const hadPairingBye = new Set<string>();

  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
    const arr = m.get(k) ?? []; arr.push(v); m.set(k, arr);
  };

  for (const g of [...history].sort((a, b) => a.roundNumber - b.roundNumber)) {
    if (g.whiteTpId) scores.set(g.whiteTpId, (scores.get(g.whiteTpId) ?? 0) + Number(g.whitePoints ?? 0));
    if (g.blackTpId) scores.set(g.blackTpId, (scores.get(g.blackTpId) ?? 0) + Number(g.blackPoints ?? 0));
    if (g.isBye) {
      if (g.byeKind === 'pairing') hadPairingBye.add(g.whiteTpId);
      continue;
    }
    // W.O. não conta como cor jogada (regra FIDE)
    const played = g.result === '1-0' || g.result === '0-1' || g.result === '1/2-1/2';
    if (played && g.blackTpId) {
      push(colorSeq, g.whiteTpId, 'w');
      push(colorSeq, g.blackTpId, 'b');
    }
    if (g.blackTpId) {
      (opponents.get(g.whiteTpId) ?? opponents.set(g.whiteTpId, new Set()).get(g.whiteTpId)!).add(g.blackTpId);
      (opponents.get(g.blackTpId) ?? opponents.set(g.blackTpId, new Set()).get(g.blackTpId)!).add(g.whiteTpId);
    }
  }

  for (const b of draft) {
    if (b.manualOverride) warnings.push({ code: 'MANUAL_OVERRIDE', board: b.board });

    if (b.byeKind === 'pairing' && hadPairingBye.has(b.whiteTpId)) {
      warnings.push({ code: 'SECOND_PAIRING_BYE', tpId: b.whiteTpId });
    }
    if (!b.blackTpId) continue;

    if (opponents.get(b.whiteTpId)?.has(b.blackTpId)) {
      warnings.push({ code: 'REMATCH', board: b.board, tpIds: [b.whiteTpId, b.blackTpId] });
    }

    const gap = Math.abs((scores.get(b.whiteTpId) ?? 0) - (scores.get(b.blackTpId) ?? 0));
    if (gap > 1.0) warnings.push({ code: 'SCORE_GAP', board: b.board, gap });

    for (const [tpId, color] of [[b.whiteTpId, 'w'], [b.blackTpId, 'b']] as const) {
      const seq = colorSeq.get(tpId) ?? [];
      const last2 = seq.slice(-2);
      if (last2.length === 2 && last2[0] === color && last2[1] === color) {
        warnings.push({ code: 'COLOR_STREAK', board: b.board, tpId, color });
      }
      const w = seq.filter((c) => c === 'w').length + (color === 'w' ? 1 : 0);
      const bl = seq.filter((c) => c === 'b').length + (color === 'b' ? 1 : 0);
      if (Math.abs(w - bl) > 2) {
        warnings.push({ code: 'COLOR_IMBALANCE', board: b.board, tpId, diff: Math.abs(w - bl) });
      }
    }
  }
  return warnings;
}
