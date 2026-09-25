import { describe, expect, it } from 'vitest';
import { resolveTournamentGroup } from '../use-tournament-group-preference';

describe('resolveTournamentGroup', () => {
  const groups = ['sub-7', 'sub-9', 'sub-11'];

  it('prioritizes a valid group from the URL', () => {
    expect(resolveTournamentGroup(groups, 'sub-11', 'sub-9')).toBe('sub-11');
  });

  it('restores the remembered group when the URL has no valid group', () => {
    expect(resolveTournamentGroup(groups, null, 'sub-9')).toBe('sub-9');
    expect(resolveTournamentGroup(groups, 'removed-group', 'sub-9')).toBe('sub-9');
  });

  it('falls back to the first available group', () => {
    expect(resolveTournamentGroup(groups, null, null)).toBe('sub-7');
    expect(resolveTournamentGroup(groups, null, 'removed-group')).toBe('sub-7');
    expect(resolveTournamentGroup([], null, null)).toBeNull();
  });
});
