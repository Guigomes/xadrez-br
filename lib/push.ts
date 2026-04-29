import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';

function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

async function sendToSubscriptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload: object
) {
  if (!subs.length) return;
  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      )
    )
  );
  const stale = results
    .map((r, i) => ({ r, endpoint: subs[i].endpoint }))
    .filter(({ r }) => r.status === 'rejected' && [410, 404].includes((r.reason as any)?.statusCode))
    .map(({ endpoint }) => endpoint);
  if (stale.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale);
  }
}

// Notify all subscribers of a tournament (no user filter)
export async function sendTournamentNotification(
  tournamentId: string,
  payload: { title: string; body: string; url?: string }
) {
  initVapid();
  const supabase = await createClient();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('tournament_id', tournamentId)
    .is('user_id', null); // tournament-wide subs have no user_id

  await sendToSubscriptions(supabase, subs ?? [], payload);
}

// Notify users who follow specific players (by tp_id) in a tournament
export async function notifyPlayerFollowers(
  tournamentId: string,
  // Array of { tpId, makePayload } — payload is personalised per player
  players: Array<{
    tpId: string;
    makePayload: (playerName: string) => { title: string; body: string; url?: string };
  }>
) {
  if (!players.length) return;
  initVapid();
  const supabase = await createClient();

  const tpIds = players.map((p) => p.tpId);

  // Get player_id + name for each tp_id
  const { data: tps } = await supabase
    .from('tournament_players')
    .select('id, player_id, players(full_name)')
    .eq('tournament_id', tournamentId)
    .in('id', tpIds);

  if (!tps?.length) return;

  const playerIds = tps.map((tp) => tp.player_id);

  // Find all followers of these players in this tournament
  const { data: follows } = await supabase
    .from('player_follows')
    .select('user_id, player_id')
    .eq('tournament_id', tournamentId)
    .in('player_id', playerIds);

  if (!follows?.length) return;

  const userIds = [...new Set(follows.map((f) => f.user_id))];

  // Get push subscriptions for these users
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds);

  if (!subs?.length) return;

  // Build maps
  const tpToPlayer = new Map(tps.map((tp) => [
    tp.id,
    { playerId: tp.player_id, name: (tp as any).players?.full_name ?? '' },
  ]));
  const playerToUsers = new Map<string, string[]>();
  follows.forEach((f) => {
    if (!playerToUsers.has(f.player_id)) playerToUsers.set(f.player_id, []);
    playerToUsers.get(f.player_id)!.push(f.user_id);
  });
  const userToSubs = new Map<string, typeof subs>();
  subs.forEach((s) => {
    if (!userToSubs.has(s.user_id)) userToSubs.set(s.user_id, []);
    userToSubs.get(s.user_id)!.push(s);
  });

  // Send notifications grouped by player
  for (const player of players) {
    const tp = tpToPlayer.get(player.tpId);
    if (!tp) continue;
    const payload = player.makePayload(tp.name);
    const userIds = playerToUsers.get(tp.playerId) ?? [];
    const subsForPlayers = userIds.flatMap((uid) => userToSubs.get(uid) ?? []);
    await sendToSubscriptions(supabase, subsForPlayers, payload);
  }
}
