import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), all: vi.fn(), followers: vi.fn(), nonFollowers: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/push', () => ({
  sendTournamentNotification: mocks.all,
  sendPlayerFollowersNotification: mocks.followers,
  sendTournamentNotificationToNonFollowers: mocks.nonFollowers,
}));
vi.mock('@/lib/tournament-notifications', async () => import('../tournament-notifications'));
vi.mock('@/lib/utils/date', () => ({ todayInBrazil: () => '2026-10-30' }));
import { POST } from '../../app/api/internal/notify-round/route';

type Row = Record<string, unknown>;

describe('round notification event isolation', () => {
  let round: Row;
  let tournament: Row;
  let games: Row[];
  let events: Set<string>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_PUSH_SECRET', 'test-secret');
    mocks.all.mockResolvedValue(undefined);
    mocks.followers.mockResolvedValue(undefined);
    mocks.nonFollowers.mockResolvedValue(undefined);
    round = {
      id: 'round', tournament_id: 'tournament', pairing_group_id: 'group',
      round_number: 2, status: 'ongoing', published_at: '2026-10-30T12:00:00Z',
    };
    tournament = { name: 'Copa', slug: 'copa', is_public: true, status: 'ongoing', start_date: null, end_date: null };
    games = [
      { id: 'game-a', board_number: 1, white_tp_id: 'a', black_tp_id: 'b', result: '1-0' },
      { id: 'game-b', board_number: 2, white_tp_id: 'c', black_tp_id: 'd', result: '0-1' },
    ];
    events = new Set();
    mocks.from.mockImplementation((table: string) => {
      let columns = '';
      const filters: Array<[string, unknown]> = [];
      const resolve = () => {
        let data: unknown = null;
        if (table === 'rounds') data = round;
        if (table === 'tournaments') data = tournament;
        if (table === 'pairing_groups') data = { name: 'Sub-8' };
        if (table === 'pairings') data = games;
        if (table === 'push_notification_events') data = [];
        if (table === 'tournament_players') {
          const ids = filters.find(([column]) => column === 'id')?.[1] as string[] | undefined;
          data = columns.includes('players(')
            ? (ids ?? []).map((id) => ({ id, player_id: `player-${id}`, players: { full_name: `Nome ${id}` } }))
            : ['a', 'b', 'c', 'd'].map((id) => ({ player_id: `player-${id}` }));
        }
        return { data, error: null };
      };
      const query = {
        select(value: string) { columns = value; return query; },
        eq(column: string, value: unknown) { filters.push([column, value]); return query; },
        in(column: string, value: unknown) { filters.push([column, value]); return query; },
        is() { return query; },
        limit() { return query; },
        maybeSingle: async () => resolve(),
        single: async () => resolve(),
        then(done: (value: ReturnType<typeof resolve>) => unknown) { return Promise.resolve(resolve()).then(done); },
        insert: async (row: { event_key: string }) => {
          if (events.has(row.event_key)) return { error: { code: '23505' } };
          events.add(row.event_key);
          return { error: null };
        },
      };
      return query;
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  const notify = (body: Row, secret = 'test-secret') => POST(new NextRequest('https://example.test/api/internal/notify-round', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify({ roundId: 'round', ...body }),
  }));

  it('publishing notifies every tournament subscriber, never individual results even if present', async () => {
    const response = await notify({ event: 'published' });
    expect(await response.json()).toMatchObject({ event: 'published', sent: true });
    expect(mocks.all).toHaveBeenCalledExactlyOnceWith('tournament', {
      title: 'Copa', body: 'Emparceiramento publicado · Rodada 2 · Sub-8', url: '/torneios/copa/rodadas/2',
    });
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(mocks.nonFollowers).not.toHaveBeenCalled();
  });

  it('saving even the last result targets only followers of that game, never a round summary', async () => {
    await notify({ event: 'result', pairingId: 'game-b' });
    expect(mocks.followers).toHaveBeenCalledExactlyOnceWith('tournament', ['player-c', 'player-d'], {
      title: 'Copa', body: 'Sub-8 · Nome d venceu Nome c.', url: '/torneios/copa/rodadas/2',
    });
    expect(mocks.all).not.toHaveBeenCalled();
    expect(mocks.nonFollowers).not.toHaveBeenCalled();
    expect(events.size).toBe(1);
  });

  it('rejects a game outside the requested round without any sends', async () => {
    expect((await notify({ event: 'result', pairingId: 'other-round-game' })).status).toBe(404);
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(events.size).toBe(0);
  });

  it('pending results send nothing', async () => {
    games[0].result = '*';
    await notify({ event: 'result', pairingId: 'game-a' });
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(events.size).toBe(0);
  });

  it('does not accept a finish event while the round is ongoing, even with every result', async () => {
    expect(await (await notify({ event: 'finished' })).json()).toHaveProperty('skipped');
    expect(mocks.all).not.toHaveBeenCalled();
    expect(events.size).toBe(0);
  });

  it('finishing notifies the tournament without replaying publication or individual results', async () => {
    round.status = 'finished';
    await notify({ event: 'finished' });
    expect(mocks.all).toHaveBeenCalledExactlyOnceWith('tournament', {
      title: 'Copa', body: 'Rodada 2 encerrada · Sub-8. Confira a classificação.', url: '/torneios/copa/classificacao',
    });
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(mocks.nonFollowers).not.toHaveBeenCalled();
  });

  it('an explicit closure still notifies when the organizer finishes after the planned date', async () => {
    round.status = 'finished';
    tournament.status = 'finished';
    tournament.end_date = '2026-10-29';
    await notify({ event: 'finished' });
    expect(mocks.all).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('historical reimports still skip notifications (listed=%s)', async (listed) => {
    tournament.is_public = listed;
    round.status = 'finished';
    tournament.status = 'finished';
    tournament.end_date = '2026-10-29';
    await notify({});
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(events.size).toBe(0);
  });

  it.each(['published', 'finished', 'result'])('deduplicates repeated %s requests', async (event) => {
    if (event === 'finished') round.status = 'finished';
    const body = { event, ...(event === 'result' ? { pairingId: 'game-a' } : {}) };
    await Promise.all([notify(body), notify(body)]);
    expect(mocks.all.mock.calls.length + mocks.followers.mock.calls.length).toBe(1);
  });

  it('a republication is a new notification cycle, including its results and finish', async () => {
    for (const date of ['2026-10-30T12:00:00Z', '2026-10-30T13:00:00Z']) {
      round.status = 'ongoing';
      round.published_at = date;
      await notify({ event: 'published' });
      await notify({ event: 'result', pairingId: 'game-a' });
      round.status = 'finished';
      await notify({ event: 'finished' });
    }
    expect(mocks.all).toHaveBeenCalledTimes(4);
    expect(mocks.followers).toHaveBeenCalledTimes(2);
  });

  it.each(['published', 'finished', 'result'])('a draft round cannot send %s', async (event) => {
    round.status = 'draft';
    round.published_at = null;
    await notify({ event, ...(event === 'result' ? { pairingId: 'game-a' } : {}) });
    expect(mocks.all).not.toHaveBeenCalled();
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(events.size).toBe(0);
  });

  it.each(['published', 'finished', 'result'])('unlisted tournaments send %s to the correct recipients and deduplicate retries', async (event) => {
    tournament.is_public = false;
    if (event === 'finished') round.status = 'finished';
    const body = { event, ...(event === 'result' ? { pairingId: 'game-a' } : {}) };
    const response = await notify(body);
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('skipped');
    await notify(body);
    expect(mocks.all).toHaveBeenCalledTimes(event === 'result' ? 0 : 1);
    expect(mocks.followers).toHaveBeenCalledTimes(event === 'result' ? 1 : 0);
    expect(mocks.nonFollowers).not.toHaveBeenCalled();
    expect(events.size).toBe(1);
    if (event === 'result') {
      expect(mocks.followers.mock.calls[0].slice(0, 2)).toEqual(['tournament', ['player-a', 'player-b']]);
    }
  });

  it.each(['published', 'finished', 'result'])('a draft tournament cannot send %s regardless of listing', async (event) => {
    tournament.status = 'draft';
    if (event === 'finished') round.status = 'finished';
    for (const listed of [true, false]) {
      tournament.is_public = listed;
      const response = await notify({ event, ...(event === 'result' ? { pairingId: 'game-a' } : {}) });
      expect(await response.json()).toMatchObject({ skipped: 'torneio em rascunho' });
    }
    expect(mocks.all).not.toHaveBeenCalled();
    expect(mocks.followers).not.toHaveBeenCalled();
    expect(mocks.nonFollowers).not.toHaveBeenCalled();
    expect(events.size).toBe(0);
  });

  it('legacy result panels can scan results without publication or finish notifications', async () => {
    await notify({ event: 'result' });
    expect(mocks.followers).toHaveBeenCalledTimes(2);
    expect(mocks.all).not.toHaveBeenCalled();
    expect(mocks.nonFollowers).not.toHaveBeenCalled();
  });

  it('keeps the import/Lite reconciliation path when no event is supplied', async () => {
    await notify({});
    expect(mocks.followers).toHaveBeenCalledTimes(3); // Category start and two game results.
    expect(mocks.all).not.toHaveBeenCalled();
  });

  it('also reconciles unlisted import/Lite tournaments without lifecycle broadcasts', async () => {
    tournament.is_public = false;
    await notify({});
    expect(mocks.followers).toHaveBeenCalledTimes(3);
    expect(mocks.all).not.toHaveBeenCalled();
  });

  it('rejects invalid event types and secrets', async () => {
    expect((await notify({ event: 'reopen' })).status).toBe(400);
    expect((await notify({ event: 'published' }, 'invalid')).status).toBe(401);
    expect(events.size).toBe(0);
  });
});
