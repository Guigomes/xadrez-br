import { describe, expect, it } from 'vitest';
import { requestedByeScoreForRound } from '../requested-bye';

describe('requested bye allowance', () => {
  it.each([
    [0.5, 1, 0.5], [0.5, 2, 0], [0.5, 3, 0], [0.5, 9, 0],
    [0, 1, 0], [0, 2, 0], [null, 1, 0], [null, 2, 0],
  ] as const)('configuration %s gives %s-round bye %s points', (score, round, expected) => {
    expect(requestedByeScoreForRound(score, round)).toBe(expected);
  });
});
