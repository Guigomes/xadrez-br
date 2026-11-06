import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous: boolean } | null,
  inserts: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
  createAdminClient: () => ({
    from: () => ({ insert: async (row: Record<string, unknown>) => { mocks.inserts.push(row); return { error: mocks.insertError }; } }),
  }),
}));

import { POST } from '@/app/api/promo/click/route';
import { PROMO_CAMPAIGN } from '@/lib/promo/banner';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
const click = (body: unknown, ua = ANDROID) => POST(new NextRequest('https://example.test/api/promo/click', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'user-agent': ua },
}));

beforeEach(() => { mocks.user = null; mocks.inserts = []; mocks.insertError = null; });

describe('POST /api/promo/click', () => {
  it('visitante sem conta: grava campanha, página e aparelho, sem identificação', async () => {
    const res = await click({ campaign: PROMO_CAMPAIGN, path: '/torneios/x/rodadas/3' });
    expect(res.status).toBe(204);
    expect(mocks.inserts).toEqual([{ campaign: PROMO_CAMPAIGN, path: '/torneios/x/rodadas/3', device_type: 'mobile', user_id: null }]);
  });

  it('conta logada: grava quem clicou; sessão anônima não conta como conta', async () => {
    mocks.user = { id: 'user-1', is_anonymous: false };
    await click({ campaign: PROMO_CAMPAIGN, path: '/' });
    mocks.user = { id: 'anon-1', is_anonymous: true };
    await click({ campaign: PROMO_CAMPAIGN, path: '/' });
    expect(mocks.inserts.map((row) => row.user_id)).toEqual(['user-1', null]);
  });

  it('recusa campanha fora do formato, caminho absoluto externo e JSON quebrado', async () => {
    expect((await click({ campaign: '<script>' })).status).toBe(400);
    expect((await click({ campaign: PROMO_CAMPAIGN, path: 'https://evil.example' })).status).toBe(400);
    expect((await click({ campaign: PROMO_CAMPAIGN, path: '/' + 'x'.repeat(600) })).status).toBe(400);
    expect((await click('{quebrado')).status).toBe(400);
    expect(mocks.inserts).toHaveLength(0);
  });

  it('erro do banco não vaza ao cliente', async () => {
    mocks.insertError = { message: 'relation detail' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await click({ campaign: PROMO_CAMPAIGN });
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain('relation');
  });
});
