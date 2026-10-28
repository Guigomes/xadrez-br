import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const insert = vi.fn();
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const publicFrom = vi.fn(() => ({ insert }));
  const adminFrom = vi.fn(() => ({ select }));
  return { insert, single, eq, select, publicFrom, adminFrom };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: mocks.publicFrom }),
  createAdminClient: () => ({ from: mocks.adminFrom }),
}));

import { POST } from '../../app/api/registrations/route';

const payload = {
  tournament_id: '24fa4edc-64f4-4091-9672-96d7e38acc24',
  full_name: 'Jogador de Teste',
  federation: 'BRA',
};
const request = (body: unknown) => new NextRequest('http://localhost/api/registrations', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});

describe('anonymous tournament registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A plain INSERT succeeds; attempting .select() on its result would fail,
    // just as the anonymous role cannot SELECT private registrations in RLS.
    mocks.insert.mockResolvedValue({ error: null });
    mocks.single.mockImplementation(async () => ({
      data: { id: mocks.insert.mock.calls[0][0].id, payment_status: 'not_required', is_waitlisted: false },
      error: null,
    }));
  });

  it('accepts without login or a public SELECT and returns only the new confirmation', async () => {
    const response = await POST(request(payload));
    expect(response.status).toBe(201);
    const inserted = mocks.insert.mock.calls[0][0];
    expect(inserted).toMatchObject(payload);
    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith('id, payment_status, is_waitlisted');
    expect(mocks.eq).toHaveBeenCalledWith('id', inserted.id);
    expect(await response.json()).toEqual({ id: inserted.id, payment_status: 'not_required', is_waitlisted: false });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([
    { payment_status: 'pending', is_waitlisted: false },
    { payment_status: 'not_required', is_waitlisted: true },
  ])('preserves database payment/waitlist decisions: %j', async (decision) => {
    mocks.single.mockResolvedValue({ data: { id: 'new-registration', ...decision }, error: null });
    const response = await POST(request(payload));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject(decision);
  });

  it.each([
    { code: '42501', message: 'new row violates row-level security policy', status: 403 },
    { code: 'P0001', message: 'TOURNAMENT_FULL', status: 400 },
    { code: 'P0001', message: 'PAYMENT_RECEIPT_REQUIRED', status: 400 },
  ])('keeps INSERT restrictions: $message', async ({ code, message, status }) => {
    mocks.insert.mockResolvedValue({ error: { code, message } });
    const response = await POST(request(payload));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it.each(['id', 'status', 'payment_status', 'user_id', 'is_waitlisted'])('rejects caller-controlled %s', async (field) => {
    const response = await POST(request({ ...payload, [field]: 'forged' }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('does not expose database details if confirmation fails', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
    const response = await POST(request(payload));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database detail');
  });
});
