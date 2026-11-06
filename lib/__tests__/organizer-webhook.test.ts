import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/reports/orders', () => ({ reportOrderPatchForPayment: vi.fn() }));
vi.mock('@/lib/finance/settlement', () => ({ paidRegistrationFields: vi.fn() }));
import { applyAsaasPaymentEvent, applyAsaasSubscriptionEvent } from '../asaas/webhook-handler';

describe('organizer payment lifecycle', () => {
  let status: string;
  let failWrite: boolean;
  let duplicate: boolean;
  const updates: { table: string; patch: Record<string, unknown>; filters: unknown[][] }[] = [];
  const deletions = vi.fn();
  const from = vi.fn((table: string) => {
    const filters: unknown[][] = [];
    let patch: Record<string, unknown> | undefined;
    let deleting = false;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (...args: unknown[]) => { filters.push(args); return q; };
    q.update = (value: Record<string, unknown>) => { patch = value; return q; };
    q.delete = () => { deleting = true; return q; };
    q.insert = async () => ({ error: duplicate ? { code: '23505' } : null });
    q.maybeSingle = async () => ({ data: table === 'subscriptions'
      ? { id: 'local-sub', user_id: 'owner', plan_id: 'organizer', status }
      : { id: 'free' }, error: null });
    q.then = (resolve: (v: unknown) => void) => {
      if (deleting) deletions(filters);
      if (patch && !failWrite) {
        updates.push({ table, patch, filters });
        if (table === 'subscriptions' && patch.status) status = String(patch.status);
      }
      resolve({ error: failWrite && patch ? { code: 'XX000', message: 'temporary failure' } : null });
    };
    return q;
  });
  // This mock preserves Supabase's awaited query contract without a real network.
  const admin = { from } as unknown as Parameters<typeof applyAsaasPaymentEvent>[0];
  const payment = (event: string) => applyAsaasPaymentEvent(admin, { event, payment: { id: 'payment', subscription: 'remote-sub', dueDate: '2026-11-02' } });
  beforeEach(() => { status = 'pending'; failWrite = false; duplicate = false; updates.length = 0; vi.clearAllMocks(); });
  it.each(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])('grants only after %s', async (event) => {
    expect(await payment(event)).toEqual({ outcome: 'applied', status: 'active' });
    expect(status).toBe('active');
    expect(updates).toContainEqual(expect.objectContaining({ table: 'user_profiles', patch: { plan_id: 'organizer' } }));
  });
  it('does not grant on invoice creation', async () => {
    expect(await payment('PAYMENT_CREATED')).toMatchObject({ status: 'ignored' });
    expect(status).toBe('pending'); expect(updates).toHaveLength(0);
  });
  it('overdue removes paid entitlement through subscription status', async () => {
    status = 'active'; await payment('PAYMENT_OVERDUE'); expect(status).toBe('overdue');
  });
  it.each(['PAYMENT_REFUNDED', 'PAYMENT_DELETED', 'PAYMENT_CHARGEBACK_REQUESTED'])('revokes after %s without overwriting another plan', async (event) => {
    status = 'active'; await payment(event); expect(status).toBe('canceled');
    expect(updates.find((u) => u.table === 'user_profiles')?.filters).toContainEqual(['plan_id', 'organizer']);
  });
  it.each(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])('revokes provider cancellation %s; repeated delivery is safe', async (event) => {
    status = 'active';
    const body = { event, subscription: { id: 'remote-sub' } };
    expect(await applyAsaasSubscriptionEvent(admin, body)).toMatchObject({ status: 'canceled' });
    expect(await applyAsaasSubscriptionEvent(admin, body)).toMatchObject({ status: 'canceled' });
    await payment('PAYMENT_CONFIRMED');
    expect(status).toBe('canceled');
  });
  it('does not grant on subscription creation or updates', async () => {
    for (const event of ['SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED']) {
      expect(await applyAsaasSubscriptionEvent(admin, { event, subscription: { id: 'remote-sub' } })).toMatchObject({ status: 'ignored' });
    }
    expect(updates).toHaveLength(0);
  });
  it('deduplicates confirmed events', async () => {
    duplicate = true;
    expect(await payment('PAYMENT_CONFIRMED')).toEqual({ outcome: 'duplicate' });
    expect(updates).toHaveLength(0);
  });
  it('fails and removes the dedup marker on a database write failure so provider retries can work', async () => {
    failWrite = true;
    await expect(payment('PAYMENT_CONFIRMED')).rejects.toMatchObject({ code: 'XX000' });
    expect(deletions).toHaveBeenCalledWith([['payment_id', 'payment'], ['event', 'PAYMENT_CONFIRMED']]);
    failWrite = false;
    await payment('PAYMENT_CONFIRMED'); expect(status).toBe('active');
  });
});
