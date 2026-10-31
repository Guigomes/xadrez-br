import { describe, expect, it } from 'vitest';
import { afterRoundFinishHref, resolveRoundSelection, roundPreparationHref } from '../round-navigation';

const round = (n: number, status: 'draft' | 'ongoing' | 'finished') => ({ id: `r${n}`, round_number: n, status });

describe('round preparation navigation', () => {
  it('opens preparation after all existing rounds have finished, not the old pairing', () => {
    expect(resolveRoundSelection([round(1, 'finished')], 6, null, null)).toBe(2);
    expect(resolveRoundSelection([round(2, 'finished'), round(1, 'finished')], 6, null, null)).toBe(3);
  });
  it('still allows an explicit history selection', () => {
    expect(resolveRoundSelection([round(1, 'finished')], 6, 'r1', null)).toBe('r1');
  });
  it('opens the unfinished round or existing draft by default', () => {
    expect(resolveRoundSelection([round(1, 'finished'), round(2, 'draft')], 6, null, null)).toBe('r2');
    expect(resolveRoundSelection([round(1, 'ongoing')], 6, null, null)).toBe('r1');
  });
  it('does not resurrect the old cached ongoing round on arrival from finish', () => {
    expect(resolveRoundSelection([round(1, 'ongoing')], 6, null, '2')).toBe(2);
  });
  it('opens the generated target draft on reload rather than hiding it again', () => {
    expect(resolveRoundSelection([round(1, 'finished'), round(2, 'draft')], 6, null, '2')).toBe('r2');
  });
  it('does not prepare a nonexistent next round after the final round', () => {
    expect(resolveRoundSelection([round(6, 'finished')], 6, null, null)).toBe('r6');
    expect(resolveRoundSelection([round(6, 'finished')], 6, null, '7')).toBe('r6');
  });
  it.each(['', '0', '-1', 'NaN', '1.5', '999999999999999999999999'])('ignores invalid preparation parameter %s', (prepare) => {
    expect(resolveRoundSelection([round(1, 'ongoing')], 6, null, prepare)).toBe('r1');
  });
  it('still lets the organizer mark absences before generating the first round', () => {
    expect(resolveRoundSelection([], 6, null, null)).toBe(1);
  });
  it('preserves the group and requested next number in finish redirects', () => {
    const url = new URL(roundPreparationHref('torneio', 'sub-10', 2), 'https://example.test');
    expect(url.pathname).toBe('/admin/torneios/torneio/rodadas');
    expect(url.searchParams.get('group')).toBe('sub-10');
    expect(url.searchParams.get('prepare')).toBe('2');
    expect(url.searchParams.has('round')).toBe(false);
  });
  it('keeps the finished-tournament redirect to standings', () => {
    expect(afterRoundFinishHref('torneio', 'sub-10', 7, 'finished')).toBe('/admin/torneios/torneio/classificacao');
    expect(afterRoundFinishHref('torneio', 'sub-10', 2, 'ongoing')).toBe(roundPreparationHref('torneio', 'sub-10', 2));
  });
});
