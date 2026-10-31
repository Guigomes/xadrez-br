import { describe, expect, it } from 'vitest';
import type { RoundPairingRow } from '../../../types/database';
import { ongoingResultPairingIds, previewRoundResults, type ResultSubmission } from '../round-results';

const board = (id: string, result: RoundPairingRow['result'] = '*', isBye = false): RoundPairingRow => ({
  pairing_id: id, result, is_bye: isBye, board_number: isBye ? null : 1,
  white_tp_id: `${id}-w`, white_name: 'Jogador de brancas', white_rating: null,
  white_rank: null, white_score: 0, white_title: null, white_points: null,
  black_tp_id: isBye ? null : `${id}-b`, black_name: isBye ? 'BYE' : 'Jogador de pretas',
  black_rating: null, black_rank: null, black_score: 0, black_title: null,
  black_points: null, manual_override: false,
});

const visible = (boards: RoundPairingRow[], pending: ResultSubmission[] = []) => {
  const ongoingIds = ongoingResultPairingIds(boards, pending);
  return previewRoundResults(boards, pending).filter((game) => ongoingIds.has(game.pairing_id));
};

describe('ongoing result board filter', () => {
  it('keeps only unconfirmed physical boards in their original order', () => {
    const boards = [board('a'), board('b', '1-0'), board('c'), board('bye', 'bye', true)];
    expect(visible(boards).map((game) => game.pairing_id)).toEqual(['a', 'c']);
    expect(ongoingResultPairingIds(boards, []).size).toBe(2);
    expect(boards).toHaveLength(4); // Filtering never removes data needed by progress/finish.
  });

  it.each(['1-0', '0-1', '1/2-1/2', 'forfeit_white', 'forfeit_black', 'double_forfeit', 'not_paired'] as const)(
    'does not treat %s as an ongoing game', (result) => {
      expect(visible([board('a', result)])).toEqual([]);
    },
  );

  it('keeps the optimistic selected result visible while saving and removes only after confirmation', () => {
    const pending: ResultSubmission[] = [{ pairingId: 'a', result: '1-0' }];
    expect(visible([board('a'), board('b')], pending)[0].result).toBe('1-0');
    // Cache may be confirmed before the mutation leaves pending status.
    expect(visible([board('a', '1-0'), board('b')], pending).map((game) => game.pairing_id)).toEqual(['a', 'b']);
    expect(visible([board('a', '1-0'), board('b')]).map((game) => game.pairing_id)).toEqual(['b']);
  });

  it('a rejected save restores the still-visible board with its previous result', () => {
    const boards = [board('a'), board('b', '0-1')];
    expect(visible(boards, [{ pairingId: 'a', result: '1-0' }])[0].result).toBe('1-0');
    expect(visible(boards)).toMatchObject([{ pairing_id: 'a', result: '*' }]);
  });

  it('clearing a confirmed result returns that board to the ongoing list', () => {
    expect(visible([board('a', '1-0')])).toEqual([]);
    expect(visible([board('a')])).toHaveLength(1);
  });

  it('an empty round or completed round has no ongoing boards', () => {
    expect(ongoingResultPairingIds([], []).size).toBe(0);
    expect(visible([board('a', '1/2-1/2'), board('bye', 'bye', true)])).toEqual([]);
  });

  it('a saving board cannot accidentally include a bye or another round', () => {
    const pending: ResultSubmission[] = [
      { pairingId: 'bye', result: '1-0' }, { pairingId: 'other-round', result: '1-0' },
    ];
    expect(visible([board('a'), board('bye', 'bye', true)], pending).map((game) => game.pairing_id)).toEqual(['a']);
  });
});
