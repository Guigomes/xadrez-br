import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSubscriptionBillingAvailability } from '@/lib/data/billing';
import { hasActiveOrganizerSubscription as hasActiveSubscription } from '@/lib/billing/organizer';
import { PLAYER_HISTORY_ENTITLEMENT } from '@/lib/billing/player-history';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user || user.is_anonymous) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers });
  try {
    // Session/RLS only. No service client or another viewer's billing information.
    const [flags, profile, subscriptions, entitlements, offer] = await Promise.all([
      getSubscriptionBillingAvailability(),
      session.from('user_profiles').select('role').eq('id', user.id).maybeSingle(),
      session.from('subscriptions').select('status, plan_id').eq('user_id', user.id),
      session.from('plan_entitlements').select('plan_id').eq('key', PLAYER_HISTORY_ENTITLEMENT).eq('enabled', true),
      session.from('plans').select('code, price_cents, currency, billing_interval').eq('code', 'player').eq('is_public', true).maybeSingle(),
    ]);
    if (profile.error || subscriptions.error || entitlements.error || offer.error) throw new Error('Lookup failed');
    const allowed = !flags.playerHistoryBilling || profile.data?.role === 'admin'
      || hasActiveSubscription(subscriptions.data ?? [], (entitlements.data ?? []).map((row) => row.plan_id));
    return NextResponse.json({ allowed, enforced: flags.playerHistoryBilling, offer: flags.playerHistoryBilling ? offer.data : null }, { headers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível verificar o acesso ao histórico. Tente novamente.' }, { status: 503, headers });
  }
}
