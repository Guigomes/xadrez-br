import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  auth: vi.fn(), from: vi.fn(), flags: vi.fn(), customer: vi.fn(), subscription: vi.fn(), cancel: vi.fn(), payment: vi.fn(),
  plan: { id: 'plan-organizer', code: 'organizer', name: 'Organizador', price_cents: 1999, billing_interval: 'month' } as Record<string, unknown> | null,
  existing: null as { status: string; asaas_subscription_id: string } | null,
  insertError: null as { code: string } | null,
  insert: vi.fn(), profileUpdate: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: m.auth } }),
  createAdminClient: () => ({ from: m.from }),
}));
vi.mock('@/lib/data/billing', () => ({ getSubscriptionBillingAvailability: m.flags }));
vi.mock('@/lib/billing/organizer', async () => import('../billing/organizer'));
vi.mock('@/lib/utils/date', () => ({ todayInBrazil: () => '2026-11-02' }));
vi.mock('@/lib/asaas/client', () => ({
  createAsaasCustomer: m.customer, createAsaasSubscription: m.subscription,
  cancelAsaasSubscription: m.cancel, getLatestSubscriptionPayment: m.payment,
}));
import { POST } from '../../app/api/subscriptions/create/route';

const request = (body: unknown = { planCode: 'organizer' }) => new NextRequest('http://localhost/api/subscriptions/create', {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});

describe('organizer checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ data: { user: { id: 'buyer', email: 'buyer@example.test' } }, error: null });
    m.flags.mockResolvedValue({ globalBilling: false, organizerBilling: true });
    m.plan = { id: 'plan-organizer', code: 'organizer', name: 'Organizador', price_cents: 1999, billing_interval: 'month' };
    m.existing = null;
    m.insertError = null;
    m.subscription.mockResolvedValue({ id: 'sub-new' });
    m.payment.mockResolvedValue({ invoiceUrl: 'https://example.test/invoice' });
    m.cancel.mockResolvedValue(undefined);
    m.from.mockImplementation((table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) query[method] = vi.fn(() => query);
      query.maybeSingle = vi.fn(async () => ({ data: table === 'plans' ? m.plan : m.existing, error: null }));
      query.single = vi.fn(async () => ({ data: { id: 'buyer', full_name: 'Buyer', asaas_customer_id: 'cus-existing' }, error: null }));
      query.insert = vi.fn(async (data: unknown) => { m.insert(data); return { error: m.insertError }; });
      query.update = vi.fn((data: unknown) => { m.profileUpdate(data); return query; });
      query.then = (resolve: (value: unknown) => void) => resolve({ error: null });
      return query;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  it('uses the server price, creates pending only, and returns the invoice', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(m.subscription).toHaveBeenCalledWith(expect.objectContaining({ value: 19.99, cycle: 'MONTHLY', customer: 'cus-existing' }));
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'buyer', plan_id: 'plan-organizer', status: 'pending' }));
    expect(m.profileUpdate).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ subscriptionId: 'sub-new', invoiceUrl: 'https://example.test/invoice' });
  });
  it.each([null, { id: 'buyer', is_anonymous: true }])('requires a registered authenticated buyer: %j', async (user) => {
    m.auth.mockResolvedValue({ data: { user }, error: null });
    expect((await POST(request())).status).toBe(401);
    expect(m.from).not.toHaveBeenCalled();
  });
  it('rejects an unverified auth response even with a user', async () => {
    m.auth.mockResolvedValue({ data: { user: { id: 'buyer' } }, error: new Error('invalid token') });
    expect((await POST(request())).status).toBe(401);
  });
  it.each([{ planCode: 'organizer', value: 0.01 }, { planCode: 'organizer', cpfCnpj: '12' }, null])('rejects invalid or forged checkout input %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it('does not sell old mock plans while global billing is off', async () => {
    expect((await POST(request({ planCode: 'pro' }))).status).toBe(404);
    expect(m.from).not.toHaveBeenCalled();
  });
  it('sells Jogador+ for R$ 4.99/month only when the history rollout is enabled', async () => {
    m.flags.mockResolvedValue({ globalBilling: false, organizerBilling: false, playerHistoryBilling: true });
    m.plan = { id: 'plan-player', code: 'player', name: 'Jogador+', price_cents: 499, billing_interval: 'month' };
    expect((await POST(request({ planCode: 'player' }))).status).toBe(200);
    expect(m.subscription).toHaveBeenCalledWith(expect.objectContaining({ value: 4.99, cycle: 'MONTHLY' }));
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ plan_id: 'plan-player', status: 'pending' }));
    expect(m.profileUpdate).not.toHaveBeenCalled();
    expect((await POST(request({ planCode: 'organizer' }))).status).toBe(404);
  });
  it('fails closed if billing settings cannot be read', async () => {
    m.flags.mockRejectedValue(new Error('db error'));
    expect((await POST(request())).status).toBe(503);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it('requires a public, priced plan', async () => {
    m.plan = null;
    expect((await POST(request())).status).toBe(404);
    m.plan = { id: 'organizer', price_cents: null, billing_interval: 'month' };
    expect((await POST(request())).status).toBe(422);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it.each(['pending', 'overdue'])('resumes an existing %s subscription without another recurrence', async (status) => {
    m.existing = { status, asaas_subscription_id: 'sub-existing' };
    expect((await POST(request())).status).toBe(200);
    expect(m.payment).toHaveBeenCalledExactlyOnceWith('sub-existing');
    expect(m.subscription).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it('does not sell the same active subscription again', async () => {
    m.existing = { status: 'active', asaas_subscription_id: 'sub-existing' };
    expect((await POST(request())).status).toBe(409);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it('compensates only the new recurrence if a simultaneous checkout wins', async () => {
    m.insertError = { code: '23505' };
    expect((await POST(request())).status).toBe(409);
    expect(m.cancel).toHaveBeenCalledExactlyOnceWith('sub-new');
    expect(m.payment).not.toHaveBeenCalled();
  });
  it('retains the pending record if loading the invoice fails, allowing safe retry', async () => {
    m.payment.mockRejectedValueOnce(new Error('provider temporarily unavailable'));
    expect((await POST(request())).status).toBe(502);
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(m.cancel).not.toHaveBeenCalled();
    m.existing = { status: 'pending', asaas_subscription_id: 'sub-new' };
    expect((await POST(request())).status).toBe(200);
    expect(m.subscription).toHaveBeenCalledTimes(1);
  });
});
