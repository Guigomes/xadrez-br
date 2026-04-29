import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendTournamentNotification(
  tournamentId: string,
  payload: { title: string; body: string; url?: string }
) {
  const supabase = await createClient();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('tournament_id', tournamentId);

  if (!subs?.length) return;

  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      )
    )
  );

  // Remove expired/invalid subscriptions
  const stale: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const status = (r.reason as any)?.statusCode;
      if (status === 410 || status === 404) stale.push(subs[i].endpoint);
    }
  });
  if (stale.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale);
  }
}
