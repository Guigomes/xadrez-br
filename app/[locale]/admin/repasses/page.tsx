import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/data/session';
import { EmptyState } from '@/components/ui/empty-state';
import { PayoutForm } from '@/components/finance/payout-form';
import { formatCents } from '@/lib/finance/settlement';

export const metadata = { title: 'Repasses aos organizadores' };

type OverviewRow = {
  tournament_id: string;
  slug: string;
  name: string;
  start_date: string | null;
  organizer_name: string | null;
  paid_count: number;
  organizer_net_cents: number | string;
  paid_out_cents: number | string;
  balance_cents: number | string;
};

type PayoutRow = { tournament_id: string; amount_cents: number; paid_on: string; method: string; note: string | null };

export default async function PayoutsPage() {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') {
    return <EmptyState icon="🔒" title="Acesso restrito" description="Este painel é exclusivo para administradores do sistema." />;
  }

  const supabase = await createClient();
  const [{ data: overview, error }, { data: payouts }, { data: feeSetting }] = await Promise.all([
    supabase.rpc('get_payout_overview'),
    supabase.from('tournament_payouts').select('tournament_id, amount_cents, paid_on, method, note').order('paid_on', { ascending: false }),
    supabase.from('app_settings').select('value').eq('key', 'registration_platform_fee_cents').maybeSingle(),
  ]);
  const rows: OverviewRow[] = overview ?? [];
  const byTournament = new Map<string, PayoutRow[]>();
  for (const p of (payouts ?? []) as PayoutRow[]) byTournament.set(p.tournament_id, [...(byTournament.get(p.tournament_id) ?? []), p]);
  const totalBalance = rows.reduce((sum, r) => sum + Number(r.balance_cents), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Repasses aos organizadores</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Inscrições pagas online caem na conta da plataforma. Aqui fica o saldo de cada torneio a repassar ao organizador
          (bruto − tarifa do meio de pagamento − taxa da plataforma − repasses já feitos).
          Taxa atual da plataforma: <strong>{formatCents(Number(feeSetting?.value ?? 0))}</strong> por inscrição paga
          {Number(feeSetting?.value ?? 0) === 0 ? ' (desligada)' : ''}.
        </p>
        <p className="mt-2 text-sm">Total a repassar: <strong>{formatCents(totalBalance)}</strong></p>
      </div>

      {error && <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">{error.message}</p>}
      {!rows.length ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum torneio recebeu inscrição paga online ainda.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.tournament_id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/admin/tournaments/${r.slug}/report`} className="font-medium text-gray-900 dark:text-gray-100 hover:underline">{r.name}</Link>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {r.organizer_name ?? 'Organizador não informado'} · {r.paid_count} inscrição(ões) paga(s) · líquido {formatCents(r.organizer_net_cents)} · repassado {formatCents(r.paid_out_cents)}
                  </p>
                </div>
                <p className={`text-sm font-bold ${Number(r.balance_cents) > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                  Saldo {formatCents(r.balance_cents)}
                </p>
              </div>
              {(byTournament.get(r.tournament_id) ?? []).length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {byTournament.get(r.tournament_id)!.map((p, i) => (
                    <li key={i}>{new Date(`${p.paid_on}T12:00:00`).toLocaleDateString('pt-BR')} · {formatCents(p.amount_cents)} · {p.method}{p.note ? ` · ${p.note}` : ''}</li>
                  ))}
                </ul>
              )}
              <PayoutForm slug={r.slug} balanceCents={Number(r.balance_cents)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
