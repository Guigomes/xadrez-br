import { describe, it, expect } from 'vitest';
import { computeWarnings, type HistoryGame, type DraftBoard } from '../warnings';

const g = (r: number, w: string, b: string | null, result: string, extra: Partial<HistoryGame> = {}): HistoryGame => ({
  roundNumber: r, whiteTpId: w, blackTpId: b, result: result as any,
  isBye: b === null, byeKind: b === null ? 'pairing' : null,
  whitePoints: result === '1-0' ? 1 : result === '1/2-1/2' ? 0.5 : b === null ? 1 : 0,
  blackPoints: result === '0-1' ? 1 : result === '1/2-1/2' ? 0.5 : 0,
  ...extra,
});
const d = (board: number | null, w: string, b: string | null, extra: Partial<DraftBoard> = {}): DraftBoard => ({
  pairingId: `p-${board}`, board, whiteTpId: w, blackTpId: b,
  byeKind: b === null ? 'pairing' : null, manualOverride: false, ...extra,
});

describe('computeWarnings', () => {
  it('detecta rematch, score gap e segundo bye', () => {
    const history = [g(1, 'a', 'b', '1-0'), g(1, 'c', null, 'bye'), g(2, 'a', 'c', '1-0'), g(2, 'b', 'd', '1/2-1/2')];
    const warnings = computeWarnings(history, [d(1, 'a', 'b'), d(null, 'c', null)]);
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain('REMATCH');            // a×b de novo
    expect(codes).toContain('SCORE_GAP');          // a=2.0 × b=0.5 → gap 1.5
    expect(codes).toContain('SECOND_PAIRING_BYE'); // c já teve bye de pareamento
  });

  it('detecta 3ª cor seguida', () => {
    const history = [g(1, 'a', 'x', '1-0'), g(2, 'a', 'y', '1-0')];
    const warnings = computeWarnings(history, [d(1, 'a', 'z')]);
    expect(warnings.some((w) => w.code === 'COLOR_STREAK' && (w as any).tpId === 'a')).toBe(true);
  });

  it('sem avisos num pareamento limpo', () => {
    const history = [g(1, 'a', 'b', '1-0'), g(1, 'c', 'd', '0-1')];
    const warnings = computeWarnings(history, [d(1, 'a', 'd'), d(2, 'b', 'c')]);
    expect(warnings.filter((w) => w.code !== 'COLOR_STREAK')).toHaveLength(0);
  });
});
