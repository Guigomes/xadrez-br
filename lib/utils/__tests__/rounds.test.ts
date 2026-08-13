import { describe, it, expect } from 'vitest';
import { aggregateRoundStatus, summarizeRounds } from '../rounds';

describe('aggregateRoundStatus', () => {
  it('finished só se todos os grupos terminaram', () => {
    expect(aggregateRoundStatus(['finished', 'finished'])).toBe('finished');
  });
  it('ongoing se algum grupo está em jogo', () => {
    expect(aggregateRoundStatus(['finished', 'ongoing'])).toBe('ongoing');
  });
  it('pending quando nem todos terminaram e nenhum está em jogo', () => {
    expect(aggregateRoundStatus(['finished', 'pending'])).toBe('pending');
  });
  it('vazio é pending', () => {
    expect(aggregateRoundStatus([])).toBe('pending');
  });
});

describe('summarizeRounds', () => {
  it('colapsa multi-grupo por número de rodada', () => {
    const { rounds } = summarizeRounds([
      { round_number: 1, status: 'finished' },
      { round_number: 1, status: 'finished' },
      { round_number: 2, status: 'ongoing' },
      { round_number: 2, status: 'finished' },
    ]);
    expect(rounds).toEqual([
      { roundNumber: 1, status: 'finished', publishedAt: null, groupCount: 2 },
      { roundNumber: 2, status: 'ongoing', publishedAt: null, groupCount: 2 },
    ]);
  });

  it('exclui rascunho do resumo e conta à parte', () => {
    const { rounds, draftCount } = summarizeRounds([
      { round_number: 1, status: 'finished' },
      { round_number: 2, status: 'draft' },
      { round_number: 2, status: 'draft' },
    ]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].roundNumber).toBe(1);
    expect(draftCount).toBe(2);
  });

  it('publishedAt é o mais antigo entre os grupos', () => {
    const { rounds } = summarizeRounds([
      { round_number: 1, status: 'ongoing', published_at: '2026-08-10T12:00:00Z' },
      { round_number: 1, status: 'ongoing', published_at: '2026-08-10T10:00:00Z' },
    ]);
    expect(rounds[0].publishedAt).toBe('2026-08-10T10:00:00Z');
  });

  it('ordena por número de rodada', () => {
    const { rounds } = summarizeRounds([
      { round_number: 3, status: 'pending' },
      { round_number: 1, status: 'finished' },
    ]);
    expect(rounds.map((r) => r.roundNumber)).toEqual([1, 3]);
  });
});
