import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { isOrganizerBillingEnabled } from '@/lib/data/billing';
import { canAddOrganizerPlayer, FREE_TOURNAMENT_PLAYER_LIMIT, hasActiveOrganizerSubscription, ORGANIZER_ENTITLEMENT } from '@/lib/billing/organizer';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user || user.is_anonymous) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401, headers });
  const { slug } = await params;
  const { data: tournament, error: tournamentError } = await session.from('tournaments')
    .select('id, created_by').eq('slug', slug).maybeSingle();
  if (tournamentError) return NextResponse.json({ error: 'Não foi possível consultar o torneio.' }, { status: 503, headers });
  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404, headers });
  const { data: manager, error: managerError } = await session.rpc('is_tournament_manager', { p_tournament_id: tournament.id });
  if (managerError) return NextResponse.json({ error: 'Não foi possível verificar a permissão.' }, { status: 503, headers });
  if (!manager) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403, headers });

  // Privileged reads start only after verified session + tournament authorization.
  // Return decisions only, never the owner's invoices, identity or billing history.
  try {
    const admin = createAdminClient();
    const [enforced, owner, actor, subscriptions, entitlements, players] = await Promise.all([
      isOrganizerBillingEnabled(),
      admin.from('user_profiles').select('role').eq('id', tournament.created_by).maybeSingle(),
      session.from('user_profiles').select('role').eq('id', user.id).maybeSingle(),
      admin.from('subscriptions').select('status, plan_id').eq('user_id', tournament.created_by),
      session.from('plan_entitlements').select('plan_id').eq('key', ORGANIZER_ENTITLEMENT).eq('enabled', true),
      session.from('tournament_players').select('id', { count: 'exact', head: true }).eq('tournament_id', tournament.id),
    ]);
    if (owner.error || actor.error || subscriptions.error || entitlements.error || players.error || players.count === null) {
      throw new Error('Billing lookup failed');
    }
    const exempt = owner.data?.role === 'admin' || actor.data?.role === 'admin';
    const subscribed = hasActiveOrganizerSubscription(subscriptions.data ?? [], (entitlements.data ?? []).map((e) => e.plan_id));
    return NextResponse.json({
      enforced, subscribed, exempt, playerCount: players.count, playerLimit: FREE_TOURNAMENT_PLAYER_LIMIT,
      canAddPlayer: canAddOrganizerPlayer(enforced, subscribed, exempt, players.count),
      isOwner: tournament.created_by === user.id,
    }, { headers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível verificar a assinatura do organizador. Tente novamente.' }, { status: 503, headers });
  }
}
