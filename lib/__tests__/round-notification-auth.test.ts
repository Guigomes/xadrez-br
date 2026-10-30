import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), rpc: vi.fn(), internal: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.user }, from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/app/api/internal/notify-round/route', () => ({ POST: mocks.internal }));
vi.mock('@/lib/tournament-notifications', async () => import('../tournament-notifications'));
import { POST } from '../../app/api/admin/rounds/[id]/notify/route';

describe('authenticated round notification endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_PUSH_SECRET', 'test-secret');
    mocks.user.mockResolvedValue({ data: { user: { id: 'manager' } } });
    mocks.rpc.mockResolvedValue({ data: true });
    const query = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: { tournament_id: 'tournament', status: 'ongoing' } }),
    };
    mocks.from.mockReturnValue(query);
    mocks.internal.mockImplementation(async () => NextResponse.json({ ok: true }));
  });
  afterEach(() => vi.unstubAllEnvs());

  const notify = (body?: object) => POST(new NextRequest('https://example.test/api/admin/rounds/round/notify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { params: Promise.resolve({ id: 'round' }) });

  it.each([
    { event: 'published' }, { event: 'finished' }, { event: 'result', pairingId: 'game' },
  ])('delegates only the requested event: $event, never an extra summary', async (body) => {
    expect((await notify(body)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('is_tournament_manager', { p_tournament_id: 'tournament' });
    expect(mocks.internal).toHaveBeenCalledTimes(1);
    const delegated = mocks.internal.mock.calls[0][0] as NextRequest;
    expect(delegated.headers.get('x-cron-secret')).toBe('test-secret');
    expect(await delegated.json()).toEqual({ roundId: 'round', ...body });
  });

  it('treats old empty requests as results only, not publication or closure', async () => {
    await notify();
    expect(mocks.internal).toHaveBeenCalledTimes(1);
    expect(await mocks.internal.mock.calls[0][0].json()).toEqual({ roundId: 'round', event: 'result' });
  });

  it('rejects anonymous calls', async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await notify({ event: 'published' })).status).toBe(401);
    expect(mocks.internal).not.toHaveBeenCalled();
  });

  it('rejects a logged-in user who cannot manage this tournament', async () => {
    mocks.rpc.mockResolvedValue({ data: false });
    expect((await notify({ event: 'published' })).status).toBe(403);
    expect(mocks.internal).not.toHaveBeenCalled();
  });

  it('rejects an unknown round', async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null }) };
    mocks.from.mockReturnValue(query);
    expect((await notify({ event: 'published' })).status).toBe(404);
    expect(mocks.internal).not.toHaveBeenCalled();
  });

  it.each([{ event: 'reopen' }, { event: 'result', pairingId: 42 }])('rejects malformed events', async (body) => {
    expect((await notify(body)).status).toBe(400);
    expect(mocks.internal).not.toHaveBeenCalled();
  });

  it('does not delegate when notifications are not configured', async () => {
    vi.stubEnv('CRON_PUSH_SECRET', '');
    expect(await (await notify({ event: 'published' })).json()).toHaveProperty('skipped');
    expect(mocks.internal).not.toHaveBeenCalled();
  });
});
