import { describe, expect, it } from 'vitest';
import { arbiterView, boardsText, canSubmit, newRoundAssignments, resultLabel, type ArbiterBackup } from '../lite/arbiter';

const P = (id: string, name: string) => ({ id, name, club: null, rating: null });

function backup(over: Partial<ArbiterBackup> = {}): ArbiterBackup {
  return {
    tournament: { id: 't1', name: 'Escolar', roundsTotal: 5 },
    players: [P('a', 'Ana'), P('b', 'Bruno'), P('c', 'Carla'), P('d', 'Davi'), P('e', 'Eva')],
    rounds: [
      { id: 'r1', number: 1, finished: true },
      { id: 'r2', number: 2, finished: false },
    ],
    games: [
      { id: 'g1', roundId: 'r1', board: 1, whiteId: 'a', blackId: 'b', result: '1-0' },
      { id: 'g2', roundId: 'r2', board: 1, whiteId: 'c', blackId: 'a', result: '*' },
      { id: 'g3', roundId: 'r2', board: 2, whiteId: 'b', blackId: 'd', result: '0-1', reportedBy: 'Jonas' },
      { id: 'g4', roundId: 'r2', board: null, whiteId: 'e', blackId: null, result: 'bye' },
    ],
    arbiters: [
      { id: 'x', name: 'Jonas', email: 'Jonas@Escola.com ' },
      { id: 'y', name: 'Maria', email: 'maria@escola.com' },
    ],
    boardArbiters: [
      { roundNumber: 1, board: 1, arbiterId: 'x' },
      { roundNumber: 2, board: 1, arbiterId: 'x' },
      { roundNumber: 2, board: 2, arbiterId: 'x' },
    ],
    ...over,
  };
}

describe('visão do árbitro (Gambito Lite)', () => {
  it('mostra só as mesas dele na rodada atual, sem folga', () => {
    const v = arbiterView(backup(), 'jonas@escola.com')!;
    expect(v.arbiterName).toBe('Jonas');
    expect(v.round).toEqual({ number: 2, finished: false });
    expect(v.boards.map((b) => b.board)).toEqual([1, 2]);
    expect(v.boards[0].white.name).toBe('Carla');
    expect(v.boards[1].reportedBy).toBe('Jonas');
  });

  it('árbitro sem mesa na rodada vê a lista vazia; e-mail de fora não vê nada', () => {
    expect(arbiterView(backup(), 'MARIA@escola.com')!.boards).toEqual([]);
    expect(arbiterView(backup(), 'outro@escola.com')).toBeNull();
  });

  it('só lança em mesa dele, na rodada aberta', () => {
    const v = arbiterView(backup(), 'jonas@escola.com')!;
    expect(canSubmit(v, 'g2')).toHaveProperty('board');
    expect(canSubmit(v, 'g1')).toEqual({ error: 'Esta mesa não está atribuída a você nesta rodada.' });

    const closed = arbiterView(backup({ rounds: [{ id: 'r1', number: 1, finished: true }, { id: 'r2', number: 2, finished: true }] }), 'jonas@escola.com')!;
    expect(canSubmit(closed, 'g2')).toEqual({ error: 'A rodada 2 já foi encerrada pelo organizador.' });

    const notStarted = arbiterView(backup({ rounds: [], games: [] }), 'jonas@escola.com')!;
    expect(canSubmit(notStarted, 'g2')).toEqual({ error: 'O torneio ainda não começou.' });
  });
});

describe('avisos do Gambito Lite', () => {
  it('rodada nova: mesas de cada árbitro, por e-mail', () => {
    const a = newRoundAssignments(1, backup())!;
    expect(a.round).toBe(2);
    expect(a.byEmail.get('jonas@escola.com')).toEqual([1, 2]);
    expect(a.byEmail.has('maria@escola.com')).toBe(false);
    expect(newRoundAssignments(2, backup())).toBeNull();
  });

  it('texto das mesas e do resultado', () => {
    expect(boardsText([3])).toBe('3');
    expect(boardsText([1, 2, 5])).toBe('1, 2 e 5');
    expect(resultLabel('1/2-1/2')).toBe('½–½');
    expect(resultLabel('forfeit_white')).toBe('W.O. das brancas');
  });
});
