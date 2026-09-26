import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllLocalFollowedPlayerIds } from '../local-follows';

afterEach(() => vi.unstubAllGlobals());

describe('getAllLocalFollowedPlayerIds', () => {
  it('reúne atletas de todos os torneios sem duplicar', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify([
        { playerId: 'player-1', tournamentId: 'tournament-1' },
        { playerId: 'player-2', tournamentId: 'tournament-2' },
        { playerId: 'player-1', tournamentId: 'tournament-3' },
      ]),
    });

    expect([...getAllLocalFollowedPlayerIds()]).toEqual(['player-1', 'player-2']);
  });
});
