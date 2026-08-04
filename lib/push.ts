import webpush from 'web-push';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createAdminClient>;

function initVapid() {
  const email = process.env.VAPID_EMAIL!;
  const subject = email.startsWith('mailto:') ? email : `mailto:${email}`;
  webpush.setVapidDetails(
    subject,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

async function sendToSubscriptions(
  admin: AdminClient,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload: object
) {
  if (!subs.length) return;
  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message,
        { urgency: 'high', TTL: 300 }
      )
    )
  );
  const stale: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[push] sent ok to ${subs[i].endpoint.slice(0, 60)}`);
    } else {
      const code = (r.reason as any)?.statusCode;
      console.error(`[push] failed (${code}):`, r.reason?.message ?? r.reason);
      if ([410, 404].includes(code)) stale.push(subs[i].endpoint);
    }
  });
  if (stale.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', stale);
  }
}

function initFirebaseAdmin() {
  if (getApps().length) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não configurado.');
  initializeApp({ credential: cert(JSON.parse(json)) });
}

async function getAdminFcmTokens(admin: AdminClient): Promise<string[]> {
  const { data: admins } = await admin.from('user_profiles').select('id').eq('role', 'admin');
  const adminIds = (admins ?? []).map((a) => a.id);
  if (!adminIds.length) return [];

  const { data: tokens } = await admin
    .from('admin_fcm_tokens')
    .select('token')
    .in('user_id', adminIds);
  return (tokens ?? []).map((t) => t.token);
}

// Push nativo pro app Android Gambito Admin (workspace-gambito-admin) —
// substitui o polling em foreground service, que ficava sujeito a
// otimização de bateria do Android/OEM e atrasava a notificação com o app
// fechado. Mensagem sempre data-only (sem bloco `notification`): assim o
// FirebaseMessagingService do app roda em qualquer estado (foreground,
// background, processo morto) e monta a notificação ele mesmo via
// NotificationHelper, igual ao fluxo antigo de polling — em vez de deixar o
// Android exibir automaticamente e perder o clique pra sessão certa.
export async function sendFcmToAdmins(payload: {
  type: 'escalation' | 'message';
  sessionId: string;
  userName: string;
  content?: string;
}) {
  const admin = createAdminClient();
  const tokens = await getAdminFcmTokens(admin);
  if (!tokens.length) return;

  initFirebaseAdmin();
  const result = await getMessaging().sendEachForMulticast({
    tokens,
    android: { priority: 'high' },
    data: {
      type: payload.type,
      sessionId: payload.sessionId,
      userName: payload.userName,
      content: payload.content ?? '',
    },
  });

  console.log(`[fcm] ${payload.type} sessão ${payload.sessionId}: ${result.successCount}/${tokens.length} ok`);

  const stale: string[] = [];
  result.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')) {
      stale.push(tokens[i]);
    }
  });
  if (stale.length) {
    await admin.from('admin_fcm_tokens').delete().in('token', stale);
  }
}

// Notify all subscribers of a tournament regardless of user_id
export async function sendTournamentNotification(
  tournamentId: string,
  payload: { title: string; body: string; url?: string }
) {
  initVapid();
  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('tournament_id', tournamentId);

  console.log(`[push] tournament ${tournamentId}: ${subs?.length ?? 0} subs, error=${error?.message}`);
  await sendToSubscriptions(admin, subs ?? [], payload);
}

// Notify admin(s) that a user escalated a chat to a human (chat/escalate route).
// Reuses the same push_subscriptions table — subscription made without a
// tournamentId (ver EnableChatNotifications), então filtra só por user_id.
export async function sendOperatorNotification(payload: { title: string; body: string; url?: string }) {
  initVapid();
  const admin = createAdminClient();

  const { data: admins } = await admin.from('user_profiles').select('id').eq('role', 'admin');
  const adminIds = (admins ?? []).map((a) => a.id);
  if (!adminIds.length) return;

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', adminIds);

  console.log(`[push] operator notification: ${subs?.length ?? 0} subs`);
  await sendToSubscriptions(admin, subs ?? [], payload);
}

// Notify users who follow specific players (by tp_id) in a tournament
export async function notifyPlayerFollowers(
  tournamentId: string,
  players: Array<{
    tpId: string;
    makePayload: (playerName: string) => { title: string; body: string; url?: string };
  }>
) {
  if (!players.length) return;
  initVapid();
  const admin = createAdminClient();

  const tpIds = players.map((p) => p.tpId);

  const { data: tps } = await admin
    .from('tournament_players')
    .select('id, player_id, players(full_name)')
    .eq('tournament_id', tournamentId)
    .in('id', tpIds);

  if (!tps?.length) return;

  const playerIds = tps.map((tp) => tp.player_id);

  const { data: follows } = await admin
    .from('player_follows')
    .select('user_id, player_id')
    .eq('tournament_id', tournamentId)
    .in('player_id', playerIds);

  if (!follows?.length) return;

  const userIds = [...new Set(follows.map((f) => f.user_id))];

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', userIds);

  if (!subs?.length) return;

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

  for (const player of players) {
    const tp = tpToPlayer.get(player.tpId);
    if (!tp) continue;
    const payload = player.makePayload(tp.name);
    const uids = playerToUsers.get(tp.playerId) ?? [];
    const subsForPlayer = uids.flatMap((uid) => userToSubs.get(uid) ?? []);
    await sendToSubscriptions(admin, subsForPlayer, payload);
  }
}
