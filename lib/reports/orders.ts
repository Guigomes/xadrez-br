// Regras puras dos pedidos de relatório (sem acesso a banco) — testáveis.

export type ReportOrderStatus =
  | 'requested'
  | 'awaiting_payment'
  | 'paid'
  | 'in_progress'
  | 'delivered'
  | 'canceled';

export type ReportPaymentStatus = 'none' | 'pending' | 'paid' | 'overdue' | 'refunded';

export const REPORT_STATUS_LABEL: Record<ReportOrderStatus, string> = {
  requested: 'Pedido recebido',
  awaiting_payment: 'Aguardando pagamento',
  paid: 'Pago, na fila',
  in_progress: 'Em produção',
  delivered: 'Entregue',
  canceled: 'Cancelado',
};

/** Estados que o admin pode escolher à mão (entrega e pagamento têm caminho próprio). */
export const ADMIN_SETTABLE_STATUSES: ReportOrderStatus[] = ['in_progress', 'canceled'];

export interface ReportCharge {
  /** true = cria cobrança na Asaas; false = pedido gratuito. */
  charge: boolean;
  priceCents: number;
}

/**
 * Cobrança desligada (billing_enabled = false, decisão de lançamento) ou sem
 * preço válido = gratuito. Só cobra com o interruptor ligado e preço > 0.
 */
export function resolveReportCharge(
  billingEnabled: boolean,
  priceCents: number | null | undefined
): ReportCharge {
  const cents = typeof priceCents === 'number' && Number.isFinite(priceCents) ? Math.trunc(priceCents) : 0;
  if (!billingEnabled || cents <= 0) return { charge: false, priceCents: 0 };
  return { charge: true, priceCents: cents };
}

/** Status inicial do pedido conforme a cobrança. */
export function initialOrderState(charge: ReportCharge): {
  status: ReportOrderStatus;
  paymentStatus: ReportPaymentStatus;
} {
  return charge.charge
    ? { status: 'awaiting_payment', paymentStatus: 'pending' }
    : { status: 'requested', paymentStatus: 'none' };
}

/**
 * Entrega só depois do pagamento (ou de pedido gratuito). Evita liberar PDF
 * de pedido cobrado e ainda não pago, mesmo que o admin anexe o arquivo antes.
 */
export function canDeliver(order: { priceCents: number; paymentStatus: ReportPaymentStatus; status: ReportOrderStatus }): boolean {
  if (order.status === 'canceled') return false;
  if (order.priceCents > 0) return order.paymentStatus === 'paid';
  return true;
}

/**
 * Efeito de um evento de pagamento da Asaas num pedido de relatório.
 * Pagamento confirmado só avança 'awaiting_payment' (nunca desfaz entrega ou
 * produção já feitas); estorno cancela o que ainda não foi entregue.
 */
export function reportOrderPatchForPayment(
  kind: 'activate' | 'overdue' | 'cancel',
  currentStatus: ReportOrderStatus
): { payment_status: ReportPaymentStatus; status?: ReportOrderStatus } {
  if (kind === 'activate') {
    return currentStatus === 'awaiting_payment'
      ? { payment_status: 'paid', status: 'paid' }
      : { payment_status: 'paid' };
  }
  if (kind === 'overdue') return { payment_status: 'overdue' };
  return currentStatus === 'delivered'
    ? { payment_status: 'refunded' }
    : { payment_status: 'refunded', status: 'canceled' };
}

export function formatPriceBRL(cents: number): string {
  if (cents <= 0) return 'Gratuito';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function isValidCpfCnpjShape(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14;
}
