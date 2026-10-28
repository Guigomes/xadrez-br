import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { PlayerAreaTabs } from '@/components/player-hub/player-area-tabs';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/data/session';
import { getEntitlements } from '@/lib/data/entitlements';
import { Badge } from '@/components/ui/badge';
import { NotifyButton } from '@/components/tournament/notify-button';
import { AlertRuleActions, AlertRuleForm } from '@/components/alerts/rule-form';
import { loadUpcomingItems } from '@/lib/alerts/feed';
import { TIME_CONTROL_LABEL, matchesRule, type TimeControl } from '@/lib/alerts/match';
import { todayInBrazil } from '@/lib/utils/date';

export const metadata: Metadata = {
  title: 'Alertas de torneios',
  description: 'Receba aviso de torneios de xadrez novos no seu estado e no seu ritmo, do site e do calendário da CBX.',
};

type Rule = { id: string; name: string | null; ufs: string[]; time_controls: string[]; include_cbx: boolean; active: boolean; created_at: string };

const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function describe(rule: Rule): string {
  const where = rule.ufs.length ? rule.ufs.join(', ') : 'todos os estados';
  const pace = rule.time_controls.length ? rule.time_controls.map((t) => TIME_CONTROL_LABEL[t as TimeControl] ?? t).join(', ') : 'todos os ritmos';
  return `${where} · ${pace}${rule.include_cbx ? ' · site + CBX' : ' · só o site'}`;
}

export default async function AlertasPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <div className="container-app max-w-3xl py-8 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alertas de torneios</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Escolha estados e ritmos e receba aviso quando surgir um torneio novo que combine com você — dos torneios do site e do calendário oficial da CBX.
        </p>
        <Link href="/entrar?next=/alertas" className="inline-block text-sm font-medium text-brand-600 dark:text-brand-400 underline">Entrar para criar alertas</Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: rulesRaw }, entitlements, items] = await Promise.all([
    supabase.from('tournament_alert_rules').select('id, name, ufs, time_controls, include_cbx, active, created_at').order('created_at'),
    getEntitlements(),
    loadUpcomingItems(createAdminClient(), todayInBrazil(), 90),
  ]);
  const rules: Rule[] = rulesRaw ?? [];
  const activeRules = rules.filter((r) => r.active);
  const limit = entitlements.limitOf('alerts.rules');
  const atLimit = limit !== null && activeRules.length >= limit;

  const matching = items.filter((i) => activeRules.some((r) =>
    matchesRule({ ufs: r.ufs, timeControls: r.time_controls, includeCbx: r.include_cbx }, i)));

  return (
    <div className="container-app max-w-3xl py-8 space-y-8">
      {user && <PlayerAreaTabs />}
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alertas de torneios</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Avisamos uma vez por dia quando aparece um torneio novo que combina com seus alertas — do site e do calendário oficial da CBX.
        </p>
        <div className="mt-3">
          <NotifyButton idleLabel="Receber os avisos neste aparelho" activeLabel="Avisos ativos neste aparelho" />
        </div>
      </header>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Novo alerta</h2>
        <AlertRuleForm
          disabledReason={atLimit ? `Seu plano permite ${limit} alerta(s) ativo(s). Pause ou exclua um para criar outro.` : null}
        />
      </section>

      {rules.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Meus alertas</h2>
          <ul className="space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{describe(r)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{r.active ? 'Ativo' : 'Pausado'} · criado em {fmt(r.created_at.slice(0, 10))}</p>
                </div>
                <AlertRuleActions id={r.id} active={r.active} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeRules.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Próximos torneios que combinam ({matching.length})
          </h2>
          {matching.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum torneio nos próximos 90 dias com esses filtros.</p>
          ) : (
            <ul className="space-y-2">
              {matching.map((i) => (
                <li key={`${i.source}:${i.refId}`} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {i.slug ? (
                        <Link href={`/torneios/${i.slug}`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">{i.name}</Link>
                      ) : (
                        <p className="font-medium text-gray-900 dark:text-gray-100">{i.name}</p>
                      )}
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {fmt(i.startDate)}{i.endDate && i.endDate !== i.startDate ? ` a ${fmt(i.endDate)}` : ''}
                        {i.location ? ` · ${i.location}` : ''}{i.uf && !String(i.location ?? '').endsWith(i.uf) ? ` ${i.uf}` : ''}
                        {i.timeControl ? ` · ${TIME_CONTROL_LABEL[i.timeControl]}` : ''}
                        {i.organizer ? ` · ${i.organizer}` : ''}
                      </p>
                    </div>
                    <Badge className={i.source === 'site'
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}>
                      {i.source === 'site' ? 'No Gambito Torneios' : 'Calendário CBX'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
