import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchCbxMonth } from '@/lib/alerts/cbx-calendar';
import { loadUpcomingItems, type FeedItem } from '@/lib/alerts/feed';
import { alertMessage, matchesRule } from '@/lib/alerts/match';
import { sendUserNotification } from '@/lib/push';
import { todayInBrazil } from '@/lib/utils/date';

// Rodada diária dos alertas de torneio. Chamada pelo worker cron-import (que
// roda a cada poucos minutos) com o mesmo segredo do push de rodada; a rota
// se auto-limita a uma execução a cada MIN_HOURS — chamadas no meio do
// intervalo saem na hora sem fazer nada. ?force=1 ignora o intervalo.
//
// 1. espelha o calendário da CBX (mês atual e o seguinte) em cbx_calendar_events;
// 2. para cada regra ativa, acha torneios que casam e que apareceram DEPOIS da
//    criação da regra (alerta é de novidade; a lista completa fica em /alertas);
// 3. grava em tournament_alert_deliveries (nunca avisa duas vezes) e manda um
//    push-resumo por usuário.

const MIN_HOURS = 20;
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_PUSH_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_PUSH_SECRET não configurado no servidor.' }, { status: 500 });
  if (request.headers.get('x-cron-secret') !== secret) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const admin = createAdminClient();
  const force = request.nextUrl.searchParams.get('force') === '1';

  const { data: last } = await admin.from('app_settings').select('value').eq('key', 'alerts_last_run_at').maybeSingle();
  const lastRun = Date.parse(String(last?.value ?? '1970-01-01'));
  if (!force && Date.now() - lastRun < MIN_HOURS * 3600_000) {
    return NextResponse.json({ ok: true, skipped: 'executado há menos de ' + MIN_HOURS + 'h' });
  }
  // Marca antes de trabalhar: o worker chama a cada poucos minutos e uma rodada
  // lenta não pode ser disparada de novo por cima.
  await admin.from('app_settings').upsert({ key: 'alerts_last_run_at', value: new Date().toISOString(), updated_at: new Date().toISOString() });

  const today = todayInBrazil();
  const [year, month] = today.split('-').map(Number);
  const months = [[year, month], month === 12 ? [year + 1, 1] : [year, month + 1]];
  let cbxCount = 0;
  const cbxErrors: string[] = [];
  for (const [y, m] of months) {
    try {
      const events = await fetchCbxMonth(y, m);
      if (events.length) {
        const { error } = await admin.from('cbx_calendar_events').upsert(events.map((e) => ({
          cbx_id: e.cbxId, name: e.name, start_date: e.startDate, end_date: e.endDate, location: e.location, uf: e.uf,
          time_control: e.timeControl, rating: e.rating, organizer: e.organizer, status: e.status, updated_at: new Date().toISOString(),
        })), { onConflict: 'cbx_id', ignoreDuplicates: false });
        if (error) throw error;
      }
      cbxCount += events.length;
    } catch (err) {
      cbxErrors.push(`${m}/${y}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const { data: rules } = await admin
    .from('tournament_alert_rules').select('id, user_id, ufs, time_controls, include_cbx, created_at').eq('active', true);
  if (!rules?.length) return NextResponse.json({ ok: true, cbxCount, cbxErrors, rules: 0 });

  const items = await loadUpcomingItems(admin, today);
  const { data: delivered } = await admin
    .from('tournament_alert_deliveries').select('rule_id, source, ref_id').in('rule_id', rules.map((r: { id: string }) => r.id));
  const seen = new Set((delivered ?? []).map((d: { rule_id: string; source: string; ref_id: string }) => `${d.rule_id}|${d.source}|${d.ref_id}`));

  const rows: Array<{ rule_id: string; source: string; ref_id: string }> = [];
  const byUser = new Map<string, Map<string, FeedItem>>();
  for (const rule of rules) {
    const fresh = items.filter((i) =>
      Date.parse(i.seenAt) > Date.parse(rule.created_at)
      && !seen.has(`${rule.id}|${i.source}|${i.refId}`)
      && matchesRule({ ufs: rule.ufs, timeControls: rule.time_controls, includeCbx: rule.include_cbx }, i));
    for (const i of fresh) {
      rows.push({ rule_id: rule.id, source: i.source, ref_id: i.refId });
      const mine = byUser.get(rule.user_id) ?? new Map<string, FeedItem>();
      mine.set(`${i.source}|${i.refId}`, i);
      byUser.set(rule.user_id, mine);
    }
  }
  if (rows.length) {
    const { error } = await admin.from('tournament_alert_deliveries').insert(rows);
    if (error) return NextResponse.json({ error: error.message, cbxCount }, { status: 500 });
  }

  let pushed = 0;
  for (const [userId, found] of byUser) {
    try {
      await sendUserNotification(userId, { ...alertMessage([...found.values()]), url: '/alertas' });
      pushed++;
    } catch (err) {
      console.error('[tournament-alerts] push falhou:', userId, err);
    }
  }
  return NextResponse.json({ ok: true, cbxCount, cbxErrors, rules: rules.length, deliveries: rows.length, usersNotified: pushed });
}
