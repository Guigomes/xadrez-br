import { createAdminClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/data/session';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminOrderActions } from '@/components/reports/admin-order-actions';
import {
  REPORT_STATUS_LABEL, canDeliver, formatPriceBRL, type ReportOrderStatus, type ReportPaymentStatus,
} from '@/lib/reports/orders';

export const metadata = { title: 'Pedidos de relatório' };

type Row = {
  id: string;
  tournament_name: string;
  status: ReportOrderStatus;
  payment_status: ReportPaymentStatus;
  price_cents: number;
  created_at: string;
  delivered_at: string | null;
  players: { full_name: string } | null;
  user_profiles: { full_name: string | null; email: string | null } | null;
};

const PAYMENT_LABEL: Record<ReportPaymentStatus, string> = {
  none: 'sem cobrança', pending: 'pagamento pendente', paid: 'pago', overdue: 'vencido', refunded: 'estornado',
};

export default async function AdminReportOrdersPage() {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') {
    return <EmptyState icon="🔒" title="Acesso restrito" description="Este painel é exclusivo para administradores do sistema." />;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('report_orders')
    .select('id, tournament_name, status, payment_status, price_cents, created_at, delivered_at, players(full_name), user_profiles:user_id(full_name, email)')
    .order('created_at', { ascending: false }).limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const open = rows.filter((r) => r.status !== 'delivered' && r.status !== 'canceled');
  const closed = rows.filter((r) => r.status === 'delivered' || r.status === 'canceled');

  const renderRow = (r: Row) => (
    <li key={r.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{r.players?.full_name} — {r.tournament_name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {r.user_profiles?.full_name ?? 'Sem nome'} · {r.user_profiles?.email ?? 'sem e-mail'} ·{' '}
            {new Date(r.created_at).toLocaleDateString('pt-BR')} · {formatPriceBRL(r.price_cents)} ({PAYMENT_LABEL[r.payment_status]})
          </p>
        </div>
        <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{REPORT_STATUS_LABEL[r.status]}</Badge>
      </div>
      <AdminOrderActions
        orderId={r.id}
        status={r.status}
        deliverable={canDeliver({ priceCents: r.price_cents, paymentStatus: r.payment_status, status: r.status })}
      />
    </li>
  );

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Pedidos de relatório</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pedidos de relatório de desempenho. Produza o PDF fora do site (skill de relatório) e anexe aqui para entregar.
        </p>
      </div>
      <section>
        <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Abertos ({open.length})</h2>
        {open.length ? <ul className="space-y-3">{open.map(renderRow)}</ul> : <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum pedido aberto.</p>}
      </section>
      <section>
        <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Encerrados ({closed.length})</h2>
        {closed.length ? <ul className="space-y-3">{closed.map(renderRow)}</ul> : <p className="text-sm text-gray-500 dark:text-gray-400">Nada por aqui ainda.</p>}
      </section>
    </div>
  );
}
