import { describe, expect, it } from 'vitest';
import { formatPlanPrice, resolveBillingAvailability, subscriptionSalesAllowed } from '../billing/organizer';
import { isHistorySubscriptionRequired } from '../billing/player-history';

describe('player history subscription rollout', () => {
  it('launches independently of organizer and other billing', () => {
    expect(resolveBillingAvailability([
      { key: 'billing_enabled', value: false }, { key: 'organizer_billing_enabled', value: false },
      { key: 'player_history_billing_enabled', value: true },
    ])).toEqual({ globalBilling: false, organizerBilling: false, playerHistoryBilling: true });
    expect(subscriptionSalesAllowed('player', false, false, true)).toBe(true);
    expect(subscriptionSalesAllowed('player', false, true, false)).toBe(false);
    for (const code of ['organizer', 'plus', 'pro', 'federation']) expect(subscriptionSalesAllowed(code, false, false, true)).toBe(false);
  });
  it('shows the approved monthly price', () => {
    expect(formatPlanPrice({ code: 'player', price_cents: 499, currency: 'BRL', billing_interval: 'month' })).toMatch(/R\$\s*4,99\/mês/);
  });
  it('distinguishes subscription denial from temporary errors', () => {
    expect(isHistorySubscriptionRequired({ code: '42501', message: 'PLAYER_HISTORY_SUBSCRIPTION_REQUIRED: assine' })).toBe(true);
    for (const error of [null, undefined, new Error('network failed'), { code: '42501', message: 'AUTH_REQUIRED' }]) {
      expect(isHistorySubscriptionRequired(error)).toBe(false);
    }
  });
});
