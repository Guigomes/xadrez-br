import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { subscription, tournamentId, followedPlayerIds } = await request.json();
  if (!subscription?.endpoint) return NextResponse.json({ error: 'Inválido.' }, { status: 400 });

  // Get user if authenticated (optional — anonymous subscriptions are allowed)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Service role: a tabela é privada e o endpoint valida os dados do navegador.
  const admin = createAdminClient();
  const requestedPlayerIds = Array.isArray(followedPlayerIds)
    ? [...new Set(followedPlayerIds.filter((id): id is string => typeof id === 'string'))].slice(0, 100)
    : [];
  let validPlayerIds: string[] = [];
  if (tournamentId && requestedPlayerIds.length) {
    const { data: tournamentPlayers } = await admin
      .from('tournament_players')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .in('player_id', requestedPlayerIds);
    validPlayerIds = [...new Set((tournamentPlayers ?? []).map((player) => player.player_id))];
  }

  // Inscrição global (sem torneio, ex.: /alertas) num aparelho que já acompanha
  // um torneio: só vincula a conta e renova as chaves. Não pode apagar o
  // torneio nem os jogadores seguidos — os avisos por conta (sendUserNotification)
  // já chegam a qualquer inscrição do usuário.
  if (!tournamentId) {
    const { data: existing } = await admin
      .from('push_subscriptions').select('tournament_id').eq('endpoint', subscription.endpoint).maybeSingle();
    if (existing?.tournament_id) {
      const { error } = await admin.from('push_subscriptions').update({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        ...(user ? { user_id: user.id } : {}),
      }).eq('endpoint', subscription.endpoint);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
  }

  const { error } = await admin.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    tournament_id: tournamentId ?? null,
    user_id: user?.id ?? null,
    followed_player_ids: validPlayerIds,
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
