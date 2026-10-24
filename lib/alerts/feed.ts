// Torneios futuros das duas fontes do alerta, no formato comum. Só servidor.

import type { createAdminClient } from '@/lib/supabase/server';
import { dedupeAcrossSources, type AlertItem, type TimeControl } from './match';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface FeedItem extends AlertItem {
  /** Quando o torneio apareceu para nós (criação no site / primeira leitura da CBX). */
  seenAt: string;
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  /** Página no site, quando o torneio é do site. */
  slug: string | null;
}

// Ritmo do torneio do site vem de time_control_kind (o que a tela e o histórico usam).
// rating_kind NÃO serve: nasce 'std' por padrão e discorda do ritmo real em boa parte
// dos torneios importados (rápido/blitz marcados como std).
const KIND_TC: Record<string, TimeControl> = { classical: 'std', rapid: 'rpd', blitz: 'blz', bullet: 'blz' };

export async function loadUpcomingItems(admin: AdminClient, today: string, untilDays = 120): Promise<FeedItem[]> {
  const until = new Date(`${today}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + untilDays);
  const untilIso = until.toISOString().slice(0, 10);

  const [{ data: site }, { data: cbx }] = await Promise.all([
    admin.from('tournaments')
      .select('id, slug, name, start_date, end_date, city, state, time_control_kind, organizer_name, created_at')
      .eq('is_public', true)
      .in('status', ['published', 'registration', 'registration_closed'])
      .gte('start_date', today).lte('start_date', untilIso),
    admin.from('cbx_calendar_events')
      .select('cbx_id, name, start_date, end_date, location, uf, time_control, organizer, first_seen_at')
      .gte('start_date', today).lte('start_date', untilIso),
  ]);

  const items: FeedItem[] = [
    ...(site ?? []).map((t: Record<string, string | null>) => ({
      source: 'site' as const, refId: t.id!, name: t.name!, startDate: String(t.start_date).slice(0, 10),
      endDate: t.end_date ? String(t.end_date).slice(0, 10) : null, uf: t.state, timeControl: KIND_TC[t.time_control_kind ?? ''] ?? null,
      seenAt: t.created_at!, location: t.city, organizer: t.organizer_name, slug: t.slug,
    })),
    ...(cbx ?? []).map((e: Record<string, string | null>) => ({
      source: 'cbx' as const, refId: e.cbx_id!, name: e.name!, startDate: String(e.start_date).slice(0, 10),
      endDate: e.end_date ? String(e.end_date).slice(0, 10) : null, uf: e.uf, timeControl: (e.time_control as TimeControl | null) ?? null,
      seenAt: e.first_seen_at!, location: e.location, organizer: e.organizer, slug: null,
    })),
  ];
  return (dedupeAcrossSources(items) as FeedItem[]).sort((a, b) => a.startDate.localeCompare(b.startDate));
}
