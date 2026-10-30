import { describe, expect, it } from 'vitest';
import { isInitialStandings } from '../standings-state';
import { canEditPairings } from '../rounds';

describe('live standings state', () => {
  it('keeps the starting list before any recorded result', () => {
    expect(isInitialStandings([{ games_played: 0, points: 0 }], false)).toBe(true);
  });
  it('shows points before the round finishes', () => {
    expect(isInitialStandings([{ games_played: 1, points: 0 }, { games_played: 1, points: 1 }], false)).toBe(false);
  });
  it.each([0.5, 1])('shows a bye or WO worth %s with zero games played', (points) => {
    expect(isInitialStandings([{ games_played: 0, points }], false)).toBe(false);
  });
  it('shows a recorded double WO / zero bye even when all scores are zero', () => {
    expect(isInitialStandings([{ games_played: 0, points: 0 }], true)).toBe(false);
  });
  it('keeps the starting list for a different group without results', () => {
    expect(isInitialStandings([{ games_played: 0, points: 0 }], false)).toBe(true);
  });
});

describe('pairing editor lifecycle', () => {
  it('allows review only in a never-published draft', () => {
    expect(canEditPairings({ status: 'draft', published_at: null })).toBe(true);
  });
  it.each(['ongoing', 'finished', 'pending'] as const)('freezes seats in %s', (status) => {
    expect(canEditPairings({ status, published_at: null })).toBe(false);
    expect(canEditPairings({ status, published_at: '2026-10-30T20:00:00Z' })).toBe(false);
  });
  it('does not unlock an old published round reset to draft', () => {
    expect(canEditPairings({ status: 'draft', published_at: '2026-10-30T20:00:00Z' })).toBe(false);
  });
});
