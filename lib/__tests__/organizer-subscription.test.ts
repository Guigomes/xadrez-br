import { describe, expect, it } from 'vitest';
import {
  canAddOrganizerPlayer, formatPlanPrice, hasActiveOrganizerSubscription,
  resolveBillingAvailability, subscriptionSalesAllowed,
} from '../billing/organizer';

describe('organizer subscription decisions', () => {
  it.each([[0, true], [19, true], [20, false], [21, false], [150, false]])('roster %i allows next participant: %s', (count, allowed) => {
    expect(canAddOrganizerPlayer(true, false, false, count)).toBe(allowed);
  });
  it('preserves the switch, paid owner and admin exemptions', () => {
    expect(canAddOrganizerPlayer(false, false, false, 100)).toBe(true);
    expect(canAddOrganizerPlayer(true, true, false, 100)).toBe(true);
    expect(canAddOrganizerPlayer(true, false, true, 100)).toBe(true);
  });
  it.each(['pending', 'overdue', 'canceled'])('never grants access for %s', (status) => {
    expect(hasActiveOrganizerSubscription([{ status, plan_id: 'organizer' }], ['organizer'])).toBe(false);
  });
  it('requires both a confirmed payment and the right entitlement', () => {
    expect(hasActiveOrganizerSubscription([{ status: 'active', plan_id: 'player' }], ['organizer'])).toBe(false);
    expect(hasActiveOrganizerSubscription([{ status: 'active', plan_id: 'organizer' }], ['organizer'])).toBe(true);
    expect(hasActiveOrganizerSubscription([], ['organizer'])).toBe(false);
  });
  it('launches only organizer billing without selling legacy mock plans', () => {
    const flags = resolveBillingAvailability([
      { key: 'billing_enabled', value: false }, { key: 'organizer_billing_enabled', value: true },
    ]);
    expect(flags).toEqual({ globalBilling: false, organizerBilling: true, playerHistoryBilling: false });
    expect(subscriptionSalesAllowed('organizer', flags.globalBilling, flags.organizerBilling)).toBe(true);
    for (const code of ['pro', 'plus', 'federation', 'player', 'free']) {
      expect(subscriptionSalesAllowed(code, flags.globalBilling, flags.organizerBilling)).toBe(false);
    }
    expect(subscriptionSalesAllowed('organizer', false, false)).toBe(false);
  });
  it('does not treat strings as enabled flags', () => {
    expect(resolveBillingAvailability([
      { key: 'billing_enabled', value: 'true' }, { key: 'organizer_billing_enabled', value: 'true' },
    ])).toEqual({ globalBilling: false, organizerBilling: false, playerHistoryBilling: false });
  });
  it('shows the approved price and never advertises an unpriced paid plan as free', () => {
    expect(formatPlanPrice({ code: 'organizer', price_cents: 1999, currency: 'BRL', billing_interval: 'month' }))
      .toMatch(/R\$\s*19,99\/mês/);
    expect(formatPlanPrice({ code: 'organizer', price_cents: null, currency: 'BRL', billing_interval: 'month' })).toBe('Preço em definição');
    expect(formatPlanPrice({ code: 'free', price_cents: null, currency: 'BRL', billing_interval: null })).toBe('Grátis');
  });
});
