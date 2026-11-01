import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'dev' } as { id: string } | null,
  role: 'admin', profileError: false, admin: vi.fn(), profileSelect: vi.fn(),
}));
vi.mock('@/lib/analytics/tournament-tabs', async () => import('../analytics/tournament-tabs'));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: mocks.role } }) }) }) }),
  }),
  createAdminClient: mocks.admin,
}));
import { GET } from '../../app/api/admin/dev/accesses/route';

const now = new Date().toISOString();
const deviceId = 'a-device';
const userA = 'account-a';
const userB = 'account-b';
const events = [
  { id: 3, device_id: deviceId, user_id: userB, path: '/players/new', visited_at: now, city: null, region: null },
  { id: 2, device_id: deviceId, user_id: userA, path: '/players/previous', visited_at: now, city: null, region: null },
  { id: 1, device_id: deviceId, user_id: null, path: '/players/old-anonymous', visited_at: now, city: null, region: null },
];

describe('Dev-only access dashboard account attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user = { id: 'dev' }; mocks.role = 'admin'; mocks.profileError = false;
    mocks.admin.mockReturnValue({ from: (table: string) => {
      const result = table === 'site_access_events' ? { data: events, count: 3, error: null }
        : table === 'site_devices' ? { data: [{ id: deviceId, device_type: 'mobile', browser: 'Chrome', os: 'Android', is_owner: false, owner_label: null, first_seen_at: now, last_seen_at: now, last_path: '/players/new', last_city: null, last_region: null, followed_player_ids: [] }], error: null }
        : table === 'user_profiles' ? { data: [{ id: userA, full_name: 'Pessoa A', email: 'a@example.com' }, { id: userB, full_name: 'Pessoa B', email: 'b@example.com' }], error: mocks.profileError ? new Error('internal secret') : null }
        : { data: [], error: null };
      const chain = {
        select: (fields: string) => { if (table === 'user_profiles') mocks.profileSelect(fields); return chain; },
        gte: () => chain, order: () => chain, range: () => Promise.resolve(result), limit: () => chain,
        in: (_field: string, ids: string[]) => { if (table === 'user_profiles') expect(ids).toEqual([userB, userA]); return chain; },
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return chain;
    } });
  });

  it.each(['organizer', 'arbiter', 'public_user'])('does not expose account details to a signed-in %s', async (role) => {
    mocks.role = role;
    expect((await GET()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('does not expose account details to an anonymous caller', async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('uses each visit identity on a shared device without attributing its old anonymous history', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data.recent[0]).toMatchObject({ userId: userB, user: { id: userB, name: 'Pessoa B', email: 'b@example.com' } });
    expect(data.recent[1]).toMatchObject({ userId: userA, user: { id: userA, name: 'Pessoa A', email: 'a@example.com' } });
    expect(data.recent[2]).toMatchObject({ userId: null, user: null });
    expect(mocks.profileSelect).toHaveBeenCalledWith('id, full_name, email');
    expect(data.summary).toMatchObject({ last30Days: 3, uniqueDevices30Days: 1 });
  });

  it('reports a profile lookup failure without returning private internal errors', async () => {
    mocks.profileError = true;
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('internal secret');
  });
});
