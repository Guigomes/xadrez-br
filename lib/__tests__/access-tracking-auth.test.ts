import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), admin: vi.fn(), getUser: vi.fn(), insert: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient, createAdminClient: mocks.admin }));
import { POST } from '../../app/api/analytics/access/route';

const deviceId = '11111111-2222-4333-8444-555555555555';
const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const request = (extra: Record<string, unknown> = {}) => new NextRequest('https://example.test/api/analytics/access', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ deviceId, path: '/players/a-player', browser: 'Chrome', os: 'Android', deviceType: 'mobile', ...extra }),
});

describe('access tracking authenticated identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, is_anonymous: false } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({ from: (table: string) => {
      if (table === 'site_access_events') return { insert: mocks.insert };
      if (table === 'site_devices') return { update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: deviceId }, error: null }) }) }) }) };
      throw new Error(`Unexpected table ${table}`);
    } });
  });

  it('records the server-verified session user, ignoring an ID supplied in the payload', async () => {
    const response = await POST(request({ user_id: 'forged-id', userId: 'another-forged-id' }));
    expect(response.status).toBe(201);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ device_id: deviceId, user_id: userId }));
    expect(await response.json()).toEqual({ ok: true });
  });

  it('keeps unauthenticated views anonymous even if the payload claims an account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError' } });
    expect((await POST(request({ userId }))).status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
  });

  it('does not attribute a view when authentication validation fails', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: { message: 'invalid session' } });
    expect((await POST(request())).status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
  });

  it('does not label an anonymous Supabase session as a registered account', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId, is_anonymous: true } }, error: null });
    expect((await POST(request())).status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
  });

  it('does not add a view or perform an auth request during follow-only synchronization', async () => {
    expect((await POST(request({ recordAccess: false }))).status).toBe(201);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rejects invalid requests before accessing privileged storage or auth', async () => {
    expect((await POST(request({ deviceId: 'invalid' }))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
