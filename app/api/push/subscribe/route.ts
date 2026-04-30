import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { subscription, tournamentId } = await request.json();
  if (!subscription?.endpoint) return NextResponse.json({ error: 'Inválido.' }, { status: 400 });

  // Get user if authenticated (optional — anonymous subscriptions are allowed)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Use admin client to bypass RLS (push_subscriptions is open to any browser)
  const admin = createAdminClient();
  const { error } = await admin.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    tournament_id: tournamentId ?? null,
    user_id: user?.id ?? null,
  }, { onConflict: 'endpoint' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { endpoint } = await request.json();
  if (!endpoint) return NextResponse.json({ error: 'Inválido.' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
