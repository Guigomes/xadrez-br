import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ admin: vi.fn(), payment: vi.fn(), lifecycle: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: m.admin }));
vi.mock('@/lib/asaas/webhook-handler', () => ({ applyAsaasPaymentEvent: m.payment, applyAsaasSubscriptionEvent: m.lifecycle }));
import { POST } from '../../app/api/webhooks/asaas/route';
const request = (body: unknown, token = 'test-secret') => new NextRequest('http://localhost/api/webhooks/asaas', {
  method: 'POST', body: JSON.stringify(body), headers: { 'asaas-access-token': token },
});
describe('authenticated organizer webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('ASAAS_WEBHOOK_TOKEN', 'test-secret');
    m.admin.mockReturnValue({});
    m.payment.mockResolvedValue({ outcome: 'applied', status: 'active' });
    m.lifecycle.mockResolvedValue({ outcome: 'applied', status: 'canceled' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllEnvs());
  it('rejects untrusted callers before privileged writes', async () => {
    expect((await POST(request({ event: 'PAYMENT_CONFIRMED', payment: { id: 'payment' } }, 'forged'))).status).toBe(401);
    expect(m.admin).not.toHaveBeenCalled(); expect(m.payment).not.toHaveBeenCalled();
  });
  it('handles subscription cancellation without a payment object', async () => {
    const body = { event: 'SUBSCRIPTION_DELETED', subscription: { id: 'remote-sub' } };
    expect((await POST(request(body))).status).toBe(200);
    expect(m.lifecycle).toHaveBeenCalledWith({}, body); expect(m.payment).not.toHaveBeenCalled();
  });
  it.each([null, { event: true }, { event: 'PAYMENT_CONFIRMED', payment: {} }, { event: 'SUBSCRIPTION_DELETED', subscription: { id: 42 } }])('rejects invalid payload %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(m.admin).not.toHaveBeenCalled();
  });
  it('returns failure for provider retry if a subscription update fails', async () => {
    m.payment.mockRejectedValue(new Error('db failed'));
    expect((await POST(request({ event: 'PAYMENT_CONFIRMED', payment: { id: 'payment' } }))).status).toBe(500);
  });
});
