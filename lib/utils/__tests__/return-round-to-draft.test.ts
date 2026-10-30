import { describe, expect, it } from 'vitest';
import { canEditPairings, canReturnRoundToDraft, countEnteredResults } from '../rounds';

describe('return round to draft', () => {
  it.each(['ongoing', 'finished'] as const)('allows returning the latest %s round', (status) => {
    expect(canReturnRoundToDraft({ status }, true)).toBe(true);
    expect(canReturnRoundToDraft({ status }, false)).toBe(false);
  });
  it.each(['draft', 'pending'] as const)('does not offer a return for %s', (status) => {
    expect(canReturnRoundToDraft({ status }, true)).toBe(false);
  });
  it('counts wins, draws, WOs and double WOs for the destructive warning', () => {
    expect(countEnteredResults([
      { is_bye: false, result: '1-0' }, { is_bye: false, result: '0-1' },
      { is_bye: false, result: '1/2-1/2' }, { is_bye: false, result: 'forfeit_white' },
      { is_bye: false, result: 'forfeit_black' }, { is_bye: false, result: 'double_forfeit' },
      { is_bye: false, result: '*' }, { is_bye: true, result: 'bye' },
    ])).toBe(6);
  });
  it('does not treat predetermined byes as entered results to delete', () => {
    expect(countEnteredResults([{ is_bye: true, result: 'bye' }, { is_bye: false, result: '*' }])).toBe(0);
  });
  it('unlocks the editor only after the server explicitly clears publication', () => {
    expect(canEditPairings({ status: 'ongoing', published_at: '2026-10-30T20:00:00Z' })).toBe(false);
    expect(canEditPairings({ status: 'draft', published_at: '2026-10-30T20:00:00Z' })).toBe(false);
    expect(canEditPairings({ status: 'draft', published_at: null })).toBe(true);
  });
});
