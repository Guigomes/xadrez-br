/** Shared labels and pure decisions; the database trigger is authoritative. */
export const ORGANIZER_PLAN_CODE = 'organizer';
export const ORGANIZER_ENTITLEMENT = 'organizer.large_tournaments';
export const FREE_TOURNAMENT_PLAYER_LIMIT = 20;

export function resolveBillingAvailability(settings: readonly { key: string; value: unknown }[]) {
  const global = settings.find((s) => s.key === 'billing_enabled');
  return {
    globalBilling: global ? global.value === true : true,
    organizerBilling: settings.some((s) => s.key === 'organizer_billing_enabled' && s.value === true),
    playerHistoryBilling: settings.some((s) => s.key === 'player_history_billing_enabled' && s.value === true),
  };
}

export interface OrganizerSubscriptionStatus {
  enforced: boolean;
  subscribed: boolean;
  exempt: boolean;
  playerCount: number;
  playerLimit: number;
  canAddPlayer: boolean;
  isOwner: boolean;
}

export function hasActiveOrganizerSubscription(
  subscriptions: readonly { status: string; plan_id: string }[],
  eligiblePlanIds: readonly string[],
): boolean {
  const ids = new Set(eligiblePlanIds);
  return subscriptions.some((subscription) => subscription.status === 'active' && ids.has(subscription.plan_id));
}

export function canAddOrganizerPlayer(enforced: boolean, subscribed: boolean, exempt: boolean, count: number): boolean {
  return !enforced || subscribed || exempt || count < FREE_TOURNAMENT_PLAYER_LIMIT;
}

export function subscriptionSalesAllowed(planCode: string, globalBilling: boolean, organizerBilling: boolean, playerHistoryBilling = false): boolean {
  return globalBilling || (organizerBilling && planCode === ORGANIZER_PLAN_CODE) || (playerHistoryBilling && planCode === 'player');
}

export function formatPlanPrice(plan: { code: string; price_cents: number | null; currency: string; billing_interval: string | null }): string {
  if (plan.code === 'free') return 'Grátis';
  if (plan.price_cents === null || plan.price_cents <= 0 || !plan.billing_interval) return 'Preço em definição';
  const value = (plan.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: plan.currency || 'BRL' });
  return `${value}${plan.billing_interval === 'year' ? '/ano' : '/mês'}`;
}
