import webpush from 'web-push';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createAdminClient } from '@/lib/supabase/server';
import { subscriptionTracksPlayers } from '@/lib/tournament-notifications';

type AdminClient = ReturnType<typeof createAdminClient>;
type PushPayload = { title: string; body: string; url?: string };
type WebPushSubscription = { endpoint: string; p256dh: string; auth: string };

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
  subs: WebPushSubscription[],
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

// ---------- App Android Gambito Torneios (FCM) ----------
// Mesmo projeto Firebase do app do admin (FIREBASE_SERVICE_ACCOUNT_JSON). Mensagem com bloco
// `notification` (o Android mostra sozinho com o app fechado) + `data` (o app abre a tela certa
// ao tocar e, aberto, reage: ex. busca na hora o resultado que o árbitro mandou).

type AppPushData = Record<string, string>;
type AppFollowRow = { token: string; followed_player_ids: string[]; app_push_tokens: { user_id: string | null } | null };

async function sendAppFcm(admin: AdminClient, tokens: string[], payload: PushPayload, data: AppPushData = {}) {
  const unique = [...new Set(tokens)];
  if (!unique.length) return;
  try {
    initFirebaseAdmin();
  } catch (e) {
    console.error('[fcm-app]', (e as Error).message);
    return;
  }
  const result = await getMessaging().sendEachForMulticast({
    tokens: unique,
    notification: { title: payload.title, body: payload.body },
    android: { priority: 'high', notification: { channelId: 'avisos' } },
    data: { ...data, ...(payload.url ? { url: payload.url } : {}) },
  });
  console.log(`[fcm-app] ${result.successCount}/${unique.length} ok`);
  const stale: string[] = [];
  result.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument')) {
      stale.push(unique[i]);
    }
  });
  if (stale.length) await admin.from('app_push_tokens').delete().in('token', stale);
}

async function getAppFollows(admin: AdminClient, tournamentId: string) {
  const { data, error } = await admin
    .from('app_push_follows')
    .select('token, followed_player_ids, app_push_tokens(user_id)')
    .eq('tournament_id', tournamentId);
  if (error) {
    console.error('[fcm-app] seguidores:', error.message);
    return [];
  }
  return ((data ?? []) as unknown as AppFollowRow[]).map((f) => ({
    token: f.token,
    userId: f.app_push_tokens?.user_id ?? null,
    followedPlayerIds: f.followed_player_ids ?? [],
  }));
}

/** Aviso pessoal no app (organizador e árbitro do Gambito Lite): todos os aparelhos da conta. */
export async function sendAppUserNotification(userIds: string | string[], payload: PushPayload, data: AppPushData = {}) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (!ids.length) return;
  const admin = createAdminClient();
  const { data: rows } = await admin.from('app_push_tokens').select('token').in('user_id', ids);
  await sendAppFcm(admin, (rows ?? []).map((r) => r.token), payload, data);
}

/** Slug do torneio a partir do link do aviso (/torneios/<slug>/...), para o app abrir a tela. */
function slugFromUrl(url?: string) {
  return url?.match(/^\/torneios\/([^/?#]+)/)?.[1] ?? '';
}

async function getTrackedUserIds(
  admin: AdminClient,
  tournamentId: string,
  playerIds?: string[],
): Promise<Set<string>> {
  let followsQuery = admin
    .from('player_follows')
    .select('user_id')
    .eq('tournament_id', tournamentId);

  if (playerIds) {
    if (!playerIds.length) return new Set();
    followsQuery = followsQuery.in('player_id', playerIds);
  }

  let linkedPlayerIds = playerIds;
  if (!linkedPlayerIds) {
    const { data: tournamentPlayers, error } = await admin
      .from('tournament_players')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'active');
    if (error) throw error;
    linkedPlayerIds = [...new Set((tournamentPlayers ?? []).map((tp) => tp.player_id))];
  }

  const [followsResult, linksResult] = await Promise.all([
    followsQuery,
    linkedPlayerIds.length
      ? admin
          .from('user_player_links')
          .select('user_id')
          .eq('status', 'verified')
          .in('player_id', linkedPlayerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (followsResult.error) throw followsResult.error;
  if (linksResult.error) throw linksResult.error;

  return new Set([
    ...(followsResult.data ?? []).map((follow) => follow.user_id),
    ...(linksResult.data ?? []).map((link) => link.user_id),
  ]);
}

// Envia o resumo global apenas para quem acompanha o torneio, mas nao um
// jogador dele. Assinaturas anonimas entram naturalmente neste grupo.
export async function sendTournamentNotificationToNonFollowers(
  tournamentId: string,
  payload: PushPayload,
) {
  initVapid();
  const admin = createAdminClient();
  const [{ data: subs, error }, trackedUserIds] = await Promise.all([
    admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id, followed_player_ids')
      .eq('tournament_id', tournamentId),
    getTrackedUserIds(admin, tournamentId),
  ]);
  if (error) throw error;

  const recipients = (subs ?? []).filter(
    (sub) => !subscriptionTracksPlayers(
      { userId: sub.user_id, followedPlayerIds: sub.followed_player_ids },
      trackedUserIds,
    ),
  );
  console.log(`[push] tournament ${tournamentId}, sem jogador seguido: ${recipients.length} subs`);
  await sendToSubscriptions(admin, recipients, payload);

  const appRecipients = (await getAppFollows(admin, tournamentId)).filter((f) => !subscriptionTracksPlayers(f, trackedUserIds));
  await sendAppFcm(admin, appRecipients.map((f) => f.token), payload, { type: 'tournament', slug: slugFromUrl(payload.url), name: payload.title })
    .catch((e) => console.error('[fcm-app] resumo:', e));
}

// Um unico push por dispositivo, mesmo quando o usuario segue os dois
// jogadores da partida ou mais de um jogador da mesma categoria.
export async function sendPlayerFollowersNotification(
  tournamentId: string,
  playerIds: string[],
  payload: PushPayload,
) {
  const uniquePlayerIds = [...new Set(playerIds.filter(Boolean))];
  if (!uniquePlayerIds.length) return;

  initVapid();
  const admin = createAdminClient();
  // Sem retorno antecipado quando nenhuma conta segue o jogador: quem segue sem login
  // (followed_player_ids no navegador, ou no app) também precisa receber.
  const trackedUserIds = await getTrackedUserIds(admin, tournamentId, uniquePlayerIds);

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id, followed_player_ids')
    .eq('tournament_id', tournamentId);
  if (error) throw error;

  const relevantPlayerIds = new Set(uniquePlayerIds);
  const recipients = (subs ?? []).filter((sub) => subscriptionTracksPlayers(
    { userId: sub.user_id, followedPlayerIds: sub.followed_player_ids },
    trackedUserIds,
    relevantPlayerIds,
  ));
  console.log(`[push] tournament ${tournamentId}, seguidores: ${recipients.length} subs`);
  await sendToSubscriptions(admin, recipients, payload);

  const appRecipients = (await getAppFollows(admin, tournamentId)).filter((f) =>
    subscriptionTracksPlayers(f, trackedUserIds, relevantPlayerIds),
  );
  await sendAppFcm(admin, appRecipients.map((f) => f.token), payload, { type: 'player', slug: slugFromUrl(payload.url), name: payload.title })
    .catch((e) => console.error('[fcm-app] jogadores:', e));
}

export async function sendUserNotification(
  userId: string,
  payload: PushPayload
) {
  initVapid();
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
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

