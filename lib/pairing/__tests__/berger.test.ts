import { describe, it, expect } from 'vitest';
import { bergerRoundPairs, roundRobinTotalRounds } from '../berger';

/** Junta todas as rodadas de um rodízio de n slots (n par). */
function fullSchedule(n: number) {
  const rounds = [];
  for (let r = 1; r <= n - 1; r++) rounds.push(bergerRoundPairs(n, r));
  return rounds;
}

describe('berger round-robin', () => {
  it('total de rodadas: n-1 (par) e n (ímpar, com fantasma)', () => {
    expect(roundRobinTotalRounds(4)).toBe(3);
    expect(roundRobinTotalRounds(6)).toBe(5);
    expect(roundRobinTotalRounds(5)).toBe(5); // 5 → fantasma → 6 slots → 5 rodadas
    expect(roundRobinTotalRounds(7)).toBe(7);
  });

  it.each([4, 6, 8, 10])('cada par se enfrenta exatamente uma vez (n=%i)', (n) => {
    const seen = new Map<string, number>();
    for (const round of fullSchedule(n)) {
      for (const { white, black } of round) {
        const key = [white, black].sort((a, b) => a - b).join('-');
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    // total de pares distintos = C(n,2)
    expect(seen.size).toBe((n * (n - 1)) / 2);
    for (const count of seen.values()) expect(count).toBe(1);
  });

  it.each([4, 6, 8])('cada slot joga uma vez por rodada (n=%i)', (n) => {
    for (const round of fullSchedule(n)) {
      const slots = new Set<number>();
      for (const { white, black } of round) {
        expect(slots.has(white)).toBe(false);
        expect(slots.has(black)).toBe(false);
        slots.add(white);
        slots.add(black);
      }
      expect(slots.size).toBe(n); // todos jogam
    }
  });

  it('equilíbrio de cores: diferença brancas-pretas ≤ 1 por slot (n=6)', () => {
    const n = 6;
    const diff = new Map<number, number>();
    for (const round of fullSchedule(n)) {
      for (const { white, black } of round) {
        diff.set(white, (diff.get(white) ?? 0) + 1);
        diff.set(black, (diff.get(black) ?? 0) - 1);
      }
    }
    for (const d of diff.values()) expect(Math.abs(d)).toBeLessThanOrEqual(1);
  });

  it('rejeita rodada fora do intervalo', () => {
    expect(() => bergerRoundPairs(4, 0)).toThrow();
    expect(() => bergerRoundPairs(4, 4)).toThrow();
    expect(() => bergerRoundPairs(5, 1)).toThrow(); // n ímpar não é permitido
  });
});
