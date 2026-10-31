import { describe, expect, it } from 'vitest';
import type { RoundPairingRow } from '../../../types/database';
import { draftNeedsRecalculation, type DraftParticipant } from '../draft-pairing-state';

const players: DraftParticipant[] = [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }];
const game = {
  pairing_id: 'game', white_tp_id: 'a', black_tp_id: 'b', is_bye: false,
  result: '*', white_points: null, black_points: null,
} as RoundPairingRow;
const check = (overrides: Partial<Parameters<typeof draftNeedsRecalculation>[0]> = {}) => draftNeedsRecalculation({
  players, pairings: [game], requestedByeIds: new Set(), roundNumber: 1, requestedByeScore: 0.5, ...overrides,
});

describe('draft eligibility and absence changes', () => {
  it('does not offer regeneration for a current draft or a manual color/opponent swap', () => {
    expect(check()).toBe(false);
    expect(check({ pairings: [{ ...game, white_tp_id: 'b', black_tp_id: 'a', manual_override: true }] })).toBe(false);
  });
  it('detects a new absence from persisted data, including after reopening the page', () => {
    expect(check({ requestedByeIds: new Set(['a']) })).toBe(true);
  });
  it('recognizes an updated draft and detects undoing the absence', () => {
    const pairings = [
      { ...game, pairing_id: 'requested', black_tp_id: null, is_bye: true, result: 'bye' as const, white_points: 0.5 },
      { ...game, pairing_id: 'automatic', white_tp_id: 'b', black_tp_id: null, is_bye: true, result: 'bye' as const, white_points: 1 },
    ];
    expect(check({ pairings, requestedByeIds: new Set(['a']) })).toBe(false);
    expect(check({ pairings })).toBe(true);
    expect(check({ pairings, roundNumber: 2, requestedByeIds: new Set(['a']) })).toBe(true);
    pairings[0].white_points = 0;
    expect(check({ pairings, roundNumber: 2, requestedByeIds: new Set(['a']) })).toBe(false);
  });
  it('ignores requested absences belonging to another group', () => {
    expect(check({ requestedByeIds: new Set(['other-group']) })).toBe(false);
  });
  it('detects additions, removals and withdrawals, but not a future entrant', () => {
    expect(check({ players: [...players, { id: 'c', status: 'active' }] })).toBe(true);
    expect(check({ players: [players[0]] })).toBe(true);
    expect(check({ players: [players[0], { ...players[1], status: 'withdrawn' }] })).toBe(true);
    expect(check({ players: [...players, { id: 'c', status: 'active', joined_at_round: 2 }] })).toBe(false);
  });
  it('leaves an ordinary automatic bye valid', () => {
    expect(check({ players: [players[0]], pairings: [{ ...game, black_tp_id: null, is_bye: true, white_points: 1 }] })).toBe(false);
  });
  it('does not treat Berger byes or requested absences as a changed Swiss roster', () => {
    expect(check({ players: [players[0]], pairings: [{ ...game, black_tp_id: null, is_bye: true, white_points: 0 }], roundRobin: true })).toBe(false);
    expect(check({ requestedByeIds: new Set(['a']), roundRobin: true })).toBe(false);
  });
  it('waits for all required data instead of considering an unloaded draft current', () => {
    expect(check({ players: undefined })).toBeNull();
    expect(check({ pairings: undefined })).toBeNull();
    expect(check({ requestedByeIds: undefined })).toBeNull();
  });
  it('requires regeneration for empty or duplicate seating', () => {
    expect(check({ pairings: [] })).toBe(true);
    expect(check({ pairings: [game, { ...game, pairing_id: 'duplicate' }] })).toBe(true);
  });
});
