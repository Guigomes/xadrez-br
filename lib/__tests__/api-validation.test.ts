import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ upserts: [] as unknown[] }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ in: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }) }),
      }),
      upsert: async (row: unknown) => { mocks.upserts.push(row); return { error: null }; },
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { isAllowedPushEndpoint } from '@/lib/api/validation';
import { POST } from '@/app/api/push/subscribe/route';

const FCM = 'https://fcm.googleapis.com/fcm/send/abc:def';
const keys = { p256dh: 'BOr-key', auth: 'auth-key' };
const post = (body: unknown) => POST(new NextRequest('https://example.test/api/push/subscribe', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
}));

beforeEach(() => { mocks.upserts = []; });

describe('isAllowedPushEndpoint', () => {
  it('aceita os serviços de push dos navegadores', () => {
    expect(isAllowedPushEndpoint(FCM)).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
  });

  it('recusa endereço arbitrário, interno, http, porta ou sufixo falso', () => {
    expect(isAllowedPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('não é url')).toBe(false);
  });
});

describe('POST /api/push/subscribe', () => {
  it('grava inscrição válida (com ou sem torneio)', async () => {
    expect((await post({ subscription: { endpoint: FCM, keys } })).status).toBe(200);
    expect((await post({ subscription: { endpoint: FCM, keys, expirationTime: null },
      tournamentId: '11111111-2222-4333-8444-555555555555', followedPlayerIds: ['x'] })).status).toBe(200);
    expect(mocks.upserts).toHaveLength(2);
  });

  it('recusa endpoint fora dos serviços de push, sem chaves, torneio não-UUID e JSON quebrado', async () => {
    expect((await post({ subscription: { endpoint: 'http://127.0.0.1:5432/', keys } })).status).toBe(400);
    expect((await post({ subscription: { endpoint: FCM } })).status).toBe(400);
    expect((await post({ subscription: { endpoint: FCM, keys }, tournamentId: 'slug-do-torneio' })).status).toBe(400);
    expect((await post('{quebrado')).status).toBe(400);
    expect(mocks.upserts).toHaveLength(0);
  });
});
