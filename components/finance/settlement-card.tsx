import { formatCents } from '@/lib/finance/settlement';

export interface Settlement {
  paid_count: number;
  estimated_count: number;
  gross_cents: number | string;
  gateway_fee_cents: number | string;
  platform_fee_cents: number | string;
  organizer_net_cents: number | string;
  paid_out_cents: number | string;
  balance_cents: number | string;
  refunded_count: number;
}

/** Financeiro das inscrições pagas online: do bruto até o saldo a repassar ao organizador. */
export function SettlementCard({ s }: { s: Settlement }) {
  const line = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={strong ? 'font-bold' : 'font-medium'}>{value}</dd>
    </div>
  );
  return (
    <div className="card p-5 break-inside-avoid">
      <h2 className="font-bold">Financeiro das inscrições online</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {line('Inscrições pagas', String(s.paid_count))}
        {line('Valor recebido (bruto)', formatCents(s.gross_cents))}
        {line('Tarifa do meio de pagamento', `− ${formatCents(s.gateway_fee_cents)}`)}
        {line('Taxa da plataforma', `− ${formatCents(s.platform_fee_cents)}`)}
        {line('Líquido do organizador', formatCents(s.organizer_net_cents), true)}
        {line('Já repassado', `− ${formatCents(s.paid_out_cents)}`)}
        {line('Saldo a repassar', formatCents(s.balance_cents), true)}
      </dl>
      {s.estimated_count > 0 && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {s.estimated_count} pagamento(s) anterior(es) à conciliação usa(m) o valor de inscrição atual do torneio, sem a tarifa informada pelo meio de pagamento.
        </p>
      )}
      {s.refunded_count > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{s.refunded_count} inscrição(ões) estornada(s), fora da conta.</p>
      )}
    </div>
  );
}
