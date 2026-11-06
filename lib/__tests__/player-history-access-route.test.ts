import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(), flags: vi.fn(), from: vi.fn(), role: 'public_user',
  error: null as unknown, subscriptions: [] as { plan_id: string; status: string }[], filters: [] as unknown[][],
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: m.auth }, from: m.from }) }));
vi.mock('@/lib/data/billing', () => ({ getSubscriptionBillingAvailability: m.flags }));
vi.mock('@/lib/billing/organizer', async () => import('../billing/organizer'));
vi.mock('@/lib/billing/player-history', async () => import('../billing/player-history'));
import { GET } from '../../app/api/subscriptions/player-history/route';

describe('current viewer history access', () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.role = 'public_user'; m.error = null; m.subscriptions = []; m.filters = [];
    m.auth.mockResolvedValue({ data: { user: { id: 'viewer' } }, error: null });
    m.flags.mockResolvedValue({ playerHistoryBilling: true });
    m.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (...args: unknown[]) => { m.filters.push([table, ...args]); return q; };
      const result = () => ({ data: table === 'user_profiles' ? { role: m.role }
        : table === 'subscriptions' ? m.subscriptions
          : table === 'plan_entitlements' ? [{ plan_id: 'player' }, { plan_id: 'organizer' }]
            : { code: 'player', price_cents: 499, currency: 'BRL', billing_interval: 'month' }, error: m.error });
      q.maybeSingle = async () => result();
      q.then = (resolve: (v: unknown) => void) => resolve(result());
      return q;
    });
  });
  it('restricts only the viewer and returns no invoice or personal data', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ allowed: false, enforced: true, offer: { code: 'player', price_cents: 499, currency: 'BRL', billing_interval: 'month' } });
    expect(m.filters).toContainEqual(['subscriptions', 'user_id', 'viewer']);
    expect(m.filters).toContainEqual(['plan_entitlements', 'key', 'player.full_history']);
  });
  it.each(['pending', 'overdue', 'canceled'])('rejects unpaid status %s', async (status) => {
    m.subscriptions = [{ plan_id: 'player', status }];
    expect(await (await GET()).json()).toMatchObject({ allowed: false });
  });
  it('requires an enabled history entitlement as well as active payment', async () => {
    m.subscriptions = [{ plan_id: 'unrelated', status: 'active' }];
    expect(await (await GET()).json()).toMatchObject({ allowed: false });
    m.subscriptions = [{ plan_id: 'player', status: 'active' }];
    expect(await (await GET()).json()).toMatchObject({ allowed: true });
  });
  it('exempts Dev and honors rollback without granting free access to anonymous users', async () => {
    m.role = 'admin'; expect(await (await GET()).json()).toMatchObject({ allowed: true });
    m.role = 'public_user'; m.flags.mockResolvedValue({ playerHistoryBilling: false });
    expect(await (await GET()).json()).toEqual({ allowed: true, enforced: false, offer: null });
  });
  it.each([null, { id: 'viewer', is_anonymous: true }])('requires a registered session %j before queries', async (user) => {
    m.auth.mockResolvedValue({ data: { user }, error: null });
    expect((await GET()).status).toBe(401); expect(m.from).not.toHaveBeenCalled();
  });
  it('fails closed on lookup failure without leaking internals', async () => {
    m.error = { message: 'private database details' };
    const response = await GET(); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database details');
  });
});
