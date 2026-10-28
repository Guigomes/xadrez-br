import { Link } from '@/i18n/navigation';
import { PlayerAreaTabs } from '@/components/player-hub/player-area-tabs';
import { createAdminClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/data/session';
import { isBillingEnabled } from '@/lib/data/billing';
import { Badge } from '@/components/ui/badge';
import { ReportOrderForm, type OrderPlayerOption, type OrderTournamentOption } from '@/components/reports/order-form';
import { loadReportCandidates } from '@/lib/reports/candidates';
import {
  REPORT_STATUS_LABEL, canDeliver, formatPriceBRL, resolveReportCharge, type ReportOrderStatus, type ReportPaymentStatus,
} from '@/lib/reports/orders';

export const metadata = { title: 'Relatório de desempenho' };

type OrderRow = {
  id: string;
  tournament_name: string;
  status: ReportOrderStatus;
  payment_status: ReportPaymentStatus;
  price_cents: number;
  asaas_invoice_url: string | null;
  created_at: string;
  players: { full_name: string } | null;
};

const STATUS_COLOR: Record<ReportOrderStatus, string> = {
  requested: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  awaiting_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  paid: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  in_progress: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  canceled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const INCLUDES = [
  'Precisão (estilo Lichess) e gráfico de vantagem de cada partida, analisadas com Stockfish.',
  'Momentos-chave com tabuleiros: onde a partida virou.',
  'Versão técnica para o treinador e resumo em linguagem simples para o jogador.',
  'Plano de melhoria e puzzles com respostas.',
];

export default async function RelatoriosPage() {
  const user = await getSessionUser();
  const admin = createAdminClient();

  const [billingEnabled, { data: setting }] = await Promise.all([
    isBillingEnabled(),
    admin.from('app_settings').select('value').eq('key', 'report_price_cents').maybeSingle(),
  ]);
  const charge = resolveReportCharge(billingEnabled, Number(setting?.value));

  let players: OrderPlayerOption[] = [];
  const tournaments: OrderTournamentOption[] = [];
  let orders: OrderRow[] = [];

  if (user) {
    const { data: links } = await admin
      .from('user_player_links').select('player_id, players(id, full_name)')
      .eq('user_id', user.id).eq('status', 'verified');
    players = (links ?? [])
      .filter((l: { players: { id: string; full_name: string } | null }) => l.players)
      .map((l: { players: { id: string; full_name: string } }) => ({ id: l.players.id, name: l.players.full_name }));
    const playerIds = players.map((p) => p.id);

    // Só torneios com ao menos uma partida do jogador com lances: sem PGN não há o que analisar.
    const candidates = await loadReportCandidates(admin, playerIds);
    for (const c of candidates) {
      if (!c.pgnGames) continue;
      const year = c.startDate ? ` ${String(c.startDate).slice(0, 4)}` : '';
      tournaments.push({
        key: `${c.kind}:${c.tournamentId}`,
        playerId: c.playerId,
        label: `${c.name}${year} · ${c.pgnGames} de ${c.games} partidas com lances`,
      });
    }

    const { data: orderRows } = await admin
      .from('report_orders')
      .select('id, tournament_name, status, payment_status, price_cents, asaas_invoice_url, created_at, players(full_name)')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    orders = (orderRows ?? []) as unknown as OrderRow[];
  }

  return (
    <div className="container-app max-w-3xl py-8 space-y-8">
      {user && <PlayerAreaTabs />}
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Relatório de desempenho</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Uma análise completa das partidas do jogador em um torneio, feita para ajudar a evoluir.
        </p>
        <ul className="mt-4 list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300">
          {INCLUDES.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Valor por relatório: <strong>{charge.charge ? formatPriceBRL(charge.priceCents) : 'gratuito durante o lançamento'}</strong>.
          O relatório é produzido a partir das partidas registradas no Gambito Torneios e entregue em PDF.
          Só aparecem torneios com partidas que têm os lances registrados; partidas sem lances entram na tabela, mas não na análise.
        </p>
      </header>

      {!user ? (
        <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Entre na sua conta para pedir um relatório do jogador vinculado a você.
          </p>
          <Link href="/entrar?next=/relatorios" className="mt-3 inline-block text-sm font-medium text-brand-600 dark:text-brand-400 underline">
            Entrar
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Pedir um relatório</h2>
            <ReportOrderForm
              players={players}
              tournaments={tournaments}
              priceLabel={charge.charge ? formatPriceBRL(charge.priceCents) : 'Gratuito'}
              requiresPayment={charge.charge}
            />
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Meus pedidos</h2>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Você ainda não fez nenhum pedido.</p>
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{o.tournament_name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {o.players?.full_name} · {new Date(o.created_at).toLocaleDateString('pt-BR')} · {formatPriceBRL(o.price_cents)}
                        </p>
                      </div>
                      <Badge className={STATUS_COLOR[o.status]}>{REPORT_STATUS_LABEL[o.status]}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {o.status === 'awaiting_payment' && o.asaas_invoice_url && (
                        <a href={o.asaas_invoice_url} className="font-medium text-brand-600 dark:text-brand-400 underline">Pagar agora</a>
                      )}
                      {o.status === 'delivered' && canDeliver({ priceCents: o.price_cents, paymentStatus: o.payment_status, status: o.status }) && (
                        <a href={`/api/reports/orders/${o.id}/download`} className="font-medium text-brand-600 dark:text-brand-400 underline">Baixar PDF</a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
