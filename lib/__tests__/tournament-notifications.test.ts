import { describe, expect, it } from 'vitest';
import {
  allResultsFinishedEventKey,
  allRoundsStartedEventKey,
  categoryKey,
  groupRoundStartedEventKey,
  isFinalResult,
  playerResultEventKey,
  resultNotificationBody,
  summarizeCategoryRounds,
  subscriptionTracksPlayers,
} from '../tournament-notifications';

describe('eventos de notificação de torneio', () => {
  it('gera chaves estáveis por rodada, grupo e resultado', () => {
    expect(groupRoundStartedEventKey('round-1')).toBe('group-round-started:round-1');
    expect(allRoundsStartedEventKey('tournament-1', 3)).toBe('all-rounds-started:tournament-1:3');
    expect(allResultsFinishedEventKey('tournament-1', 3)).toBe('all-results-finished:tournament-1:3');
    expect(playerResultEventKey({
      roundId: 'round-1',
      boardNumber: 7,
      whiteTpId: 'white',
      blackTpId: 'black',
      result: '1-0',
    })).toBe('player-result:round-1:7:1-0');
  });

  it('distingue resultado pendente de resultados finais', () => {
    expect(isFinalResult('*')).toBe(false);
    expect(isFinalResult('1-0')).toBe(true);
    expect(isFinalResult('bye')).toBe(true);
  });

  it('descreve vencedor, empate, BYE e não emparceirado sem ambiguidade', () => {
    expect(resultNotificationBody('1-0', 'Ana', 'Bia')).toBe('Ana venceu Bia.');
    expect(resultNotificationBody('0-1', 'Ana', 'Bia')).toBe('Bia venceu Ana.');
    expect(resultNotificationBody('forfeit_white', 'Ana', 'Bia')).toBe('Bia venceu Ana.');
    expect(resultNotificationBody('1/2-1/2', 'Ana', 'Bia')).toBe('Ana e Bia empataram.');
    expect(resultNotificationBody('bye', 'Ana', null)).toBe('Ana recebeu BYE.');
    expect(resultNotificationBody('not_paired', 'Ana', null)).toBe('Ana não teve emparceiramento.');
  });

  it('usa uma chave explícita para torneio sem grupo', () => {
    expect(categoryKey(null)).toBe('__ungrouped__');
    expect(categoryKey('group-1')).toBe('group-1');
  });

  it('só libera o aviso global quando todas as categorias chegaram ao mesmo marco', () => {
    expect(summarizeCategoryRounds(['sub-8', 'sub-10'], [
      { categoryKey: 'sub-8', status: 'ongoing', results: ['*'] },
    ])).toEqual({ allStarted: false, allFinished: false, categoryCount: 2 });

    expect(summarizeCategoryRounds(['sub-8', 'sub-10'], [
      { categoryKey: 'sub-8', status: 'finished', results: ['1-0'] },
      { categoryKey: 'sub-10', status: 'ongoing', results: ['*'] },
    ])).toEqual({ allStarted: true, allFinished: false, categoryCount: 2 });

    expect(summarizeCategoryRounds(['sub-8', 'sub-10'], [
      { categoryKey: 'sub-8', status: 'finished', results: ['1-0'] },
      { categoryKey: 'sub-10', status: 'finished', results: ['1/2-1/2'] },
    ])).toEqual({ allStarted: true, allFinished: true, categoryCount: 2 });
  });

  it('segmenta seguidores autenticados e anônimos', () => {
    const authenticatedFollowers = new Set(['user-1']);
    const gamePlayers = new Set(['player-1', 'player-2']);

    expect(subscriptionTracksPlayers(
      { userId: 'user-1', followedPlayerIds: [] },
      authenticatedFollowers,
      gamePlayers,
    )).toBe(true);
    expect(subscriptionTracksPlayers(
      { userId: null, followedPlayerIds: ['player-2'] },
      authenticatedFollowers,
      gamePlayers,
    )).toBe(true);
    expect(subscriptionTracksPlayers(
      { userId: null, followedPlayerIds: [] },
      authenticatedFollowers,
      gamePlayers,
    )).toBe(false);
  });
});
