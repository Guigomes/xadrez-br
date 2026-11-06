import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), adminFactory: vi.fn(), sessionFrom: vi.fn(), adminFrom: vi.fn(), flag: vi.fn(),
  ownerRole: 'organizer', actorRole: 'arbiter', count: 20, queryError: null as unknown,
  subscriptions: [] as { status: string; plan_id: string }[], ownerFilters: [] as unknown[][],
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.auth }, rpc: m.rpc, from: m.sessionFrom }),
  createAdminClient: m.adminFactory,
}));
vi.mock('@/lib/data/billing', () => ({ isOrganizerBillingEnabled: m.flag }));
vi.mock('@/lib/billing/organizer', async () => import('../billing/organizer'));
import { GET } from '../../app/api/admin/tournaments/[slug]/organizer-subscription/route';
const get = () => GET(new Request('http://localhost/api/admin/tournaments/test/organizer-subscription'), { params: Promise.resolve({ slug: 'test' }) });

describe('private organizer subscription status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.ownerRole = 'organizer'; m.actorRole = 'arbiter'; m.count = 20; m.subscriptions = []; m.ownerFilters = []; m.queryError = null;
    m.auth.mockResolvedValue({ data: { user: { id: 'staff' } }, error: null });
    m.rpc.mockResolvedValue({ data: true, error: null });
    m.flag.mockResolvedValue(true);
    const query = (table: string, admin: boolean) => {
      const q: Record<string, unknown> = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn((...args: unknown[]) => { if (admin && table === 'subscriptions') m.ownerFilters.push(args); return q; });
      const result = () => ({
        data: table === 'tournaments' ? { id: 'event', created_by: 'owner' }
          : table === 'user_profiles' ? { role: admin ? m.ownerRole : m.actorRole }
            : table === 'subscriptions' ? m.subscriptions : table === 'plan_entitlements' ? [{ plan_id: 'paid-organizer' }] : null,
        count: m.count, error: m.queryError,
      });
      q.maybeSingle = vi.fn(async () => result());
      q.then = (resolve: (v: unknown) => void) => resolve(result());
      return q;
    };
    m.sessionFrom.mockImplementation((table: string) => query(table, false));
    m.adminFrom.mockImplementation((table: string) => query(table, true));
    m.adminFactory.mockReturnValue({ from: m.adminFrom });
  });
  it('returns only the owner entitlement decision, never invoices or identity', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ enforced: true, subscribed: false, exempt: false, playerCount: 20, playerLimit: 20, canAddPlayer: false, isOwner: false });
    expect(m.ownerFilters).toContainEqual(['user_id', 'owner']);
    expect(m.ownerFilters).not.toContainEqual(['user_id', 'staff']);
  });
  it.each([null, { id: 'staff', is_anonymous: true }])('does not make privileged reads for anonymous users: %j', async (user) => {
    m.auth.mockResolvedValue({ data: { user }, error: null });
    expect((await get()).status).toBe(401);
    expect(m.adminFactory).not.toHaveBeenCalled();
  });
  it('requires tournament management before any privileged lookup', async () => {
    m.rpc.mockResolvedValue({ data: false, error: null });
    expect((await get()).status).toBe(403);
    expect(m.adminFactory).not.toHaveBeenCalled();
  });
  it.each(['pending', 'overdue', 'canceled'])('does not grant access for %s', async (status) => {
    m.subscriptions = [{ status, plan_id: 'paid-organizer' }];
    expect(await (await get()).json()).toMatchObject({ subscribed: false, canAddPlayer: false });
  });
  it('accepts an active subscription only with the large tournament entitlement', async () => {
    m.subscriptions = [{ status: 'active', plan_id: 'paid-player' }];
    expect(await (await get()).json()).toMatchObject({ subscribed: false, canAddPlayer: false });
    m.subscriptions = [{ status: 'active', plan_id: 'paid-organizer' }];
    expect(await (await get()).json()).toMatchObject({ subscribed: true, canAddPlayer: true });
  });
  it('allows the twentieth player and exempts Dev', async () => {
    m.count = 19;
    expect(await (await get()).json()).toMatchObject({ canAddPlayer: true });
    m.count = 100; m.ownerRole = 'admin';
    expect(await (await get()).json()).toMatchObject({ exempt: true, canAddPlayer: true });
    m.ownerRole = 'organizer'; m.actorRole = 'admin';
    expect(await (await get()).json()).toMatchObject({ exempt: true, canAddPlayer: true });
  });
  it('fails closed without exposing lookup errors', async () => {
    m.flag.mockRejectedValue(new Error('private details'));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private details');
  });
});
