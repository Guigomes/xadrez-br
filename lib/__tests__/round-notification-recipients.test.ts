import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), web: vi.fn(), fcm: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/tournament-notifications', async () => import('../tournament-notifications'));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: mocks.web } }));
vi.mock('firebase-admin/app', () => ({ cert: vi.fn(), getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEachForMulticast: mocks.fcm }) }));
import { sendPlayerFollowersNotification, sendTournamentNotification } from '../push';

describe('round notification device audiences', () => {
  const devices = [
    { id: 'tournament-only', user_id: null, followed_player_ids: [] },
    { id: 'white', user_id: null, followed_player_ids: ['a'] },
    { id: 'both', user_id: null, followed_player_ids: ['a', 'b'] },
    { id: 'account-black', user_id: 'user-b', followed_player_ids: [] },
    { id: 'other-player', user_id: null, followed_player_ids: ['c'] },
    { id: 'other-tournament', user_id: null, followed_player_ids: ['a'] },
  ];
  const payload = { title: 'Copa', body: 'Aviso', url: '/torneios/copa/rodadas/2' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VAPID_EMAIL', 'test@example.test');
    mocks.web.mockResolvedValue({});
    mocks.fcm.mockResolvedValue({ successCount: 1, responses: [] });
    const scoped = (device: typeof devices[number]) => ({
      ...device, tournament_id: device.id === 'other-tournament' ? 'other' : 'tournament',
    });
    const tables: Record<string, Record<string, unknown>[]> = {
      push_subscriptions: devices.map((device) => ({
        ...scoped(device), endpoint: device.id, p256dh: 'key', auth: 'auth',
      })),
      app_push_follows: devices.map((device) => ({
        ...scoped(device), token: device.id, app_push_tokens: { user_id: device.user_id },
      })),
      player_follows: [{ tournament_id: 'tournament', player_id: 'b', user_id: 'user-b' }],
      user_player_links: [],
    };
    mocks.from.mockImplementation((table: string) => {
      let rows = tables[table] ?? [];
      const query = {
        select: () => query,
        eq(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return query; },
        in(column: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[column])); return query; },
        then(done: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(done);
        },
      };
      return query;
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('publication and closure reach all opted-in devices of this tournament, including no-player followers', async () => {
    await sendTournamentNotification('tournament', payload);
    expect(mocks.web.mock.calls.map(([sub]) => sub.endpoint).sort()).toEqual(
      ['tournament-only', 'white', 'both', 'account-black', 'other-player'].sort(),
    );
    expect(mocks.fcm).toHaveBeenCalledTimes(1);
    expect(mocks.fcm.mock.calls[0][0].tokens.sort()).toEqual(
      ['tournament-only', 'white', 'both', 'account-black', 'other-player'].sort(),
    );
  });

  it('individual results reach only either-player followers, once even following both, on web and app', async () => {
    await sendPlayerFollowersNotification('tournament', ['a', 'b', 'a'], payload);
    expect(mocks.web.mock.calls.map(([sub]) => sub.endpoint).sort()).toEqual(['account-black', 'both', 'white']);
    expect(mocks.fcm).toHaveBeenCalledTimes(1);
    expect(mocks.fcm.mock.calls[0][0].tokens.sort()).toEqual(['account-black', 'both', 'white']);
  });
});
