export const PLAYER_HISTORY_ENTITLEMENT = 'player.full_history';

export interface PlayerHistoryAccess {
  allowed: boolean;
  enforced: boolean;
  offer: { code: string; price_cents: number | null; currency: string; billing_interval: string | null } | null;
}

export function isHistorySubscriptionRequired(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'message' in error
    && String(error.message).includes('PLAYER_HISTORY_SUBSCRIPTION_REQUIRED');
}
