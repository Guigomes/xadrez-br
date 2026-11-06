import type { SupabaseClient } from '@supabase/supabase-js';
import { reportOrderPatchForPayment } from '@/lib/reports/orders';
import { paidRegistrationFields } from '@/lib/finance/settlement';

// Lógica de sincronização (Asaas -> subscriptions -> user_profiles.plan_id),
// compartilhada entre o webhook real (app/api/webhooks/asaas/route.ts) e o
// gatilho de mock (app/api/mock/asaas-confirm/route.ts) — os dois recebem o
// mesmo formato de evento, só a origem (Asaas de verdade vs. botão de teste)
// muda.

export interface AsaasPaymentEvent {
  event: string;
  payment: {
    id: string;
    subscription?: string | null;
    dueDate?: string;
    /** Valor cobrado, em reais. */
    value?: number;
    /** Líquido depois da tarifa da Asaas, em reais (conciliação do repasse). */
    netValue?: number;
  };
}

export interface AsaasSubscriptionEvent {
  event: string;
  subscription: { id: string };
}

/** Provider lifecycle events can revoke access, never grant it without payment.
 * Repeated deliveries are safe: these are terminal, idempotent assignments. */
export async function applyAsaasSubscriptionEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  { event, subscription }: AsaasSubscriptionEvent,
): Promise<ApplyEventResult> {
  if (!['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(event)) {
    return { outcome: 'applied', status: 'ignored' };
  }
  const { data: local, error } = await admin.from('subscriptions')
    .select('id, user_id, plan_id').eq('asaas_subscription_id', subscription.id).maybeSingle();
  if (error) throw error;
  if (!local) return { outcome: 'unknown_subscription' };
  const { error: updateError } = await admin.from('subscriptions').update({ status: 'canceled' }).eq('id', local.id);
  if (updateError) throw updateError;
  await resetSubscriptionProfile(admin, local);
  return { outcome: 'applied', status: 'canceled' };
}

async function resetSubscriptionProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  subscription: { user_id: string; plan_id: string },
) {
  const { data: freePlan, error } = await admin.from('plans').select('id').eq('code', 'free').maybeSingle();
  if (error) throw error;
  if (freePlan) {
    // An old cancellation must not overwrite a different, newer plan.
    const { error: updateError } = await admin.from('user_profiles').update({ plan_id: freePlan.id })
      .eq('id', subscription.user_id).eq('plan_id', subscription.plan_id);
    if (updateError) throw updateError;
  }
}

const ACTIVATE_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE']);
const CANCEL_EVENTS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_DELETED', 'PAYMENT_CHARGEBACK_REQUESTED']);

export type ApplyEventResult =
  | { outcome: 'duplicate' }
  | { outcome: 'unknown_subscription' }
  | { outcome: 'unmatched' }
  | { outcome: 'applied'; status: string };

/**
 * Dedup: quem chama de novo com (payment.id, event) repetidos (retry da
 * Asaas, ou clique duplicado no botão de mock) recebe 'duplicate' e não
 * reaplica efeito nenhum.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyAsaasPaymentEvent(
  admin: SupabaseClient<any>,
  { event, payment }: AsaasPaymentEvent
): Promise<ApplyEventResult> {
  const { error: dedupError } = await admin
    .from('asaas_webhook_events')
    .insert({ event, payment_id: payment.id, payload: { event, payment } });
  if (dedupError) {
    if ((dedupError as { code?: string }).code === '23505') {
      return { outcome: 'duplicate' };
    }
    throw dedupError;
  }

  if (payment.subscription) {
    try {
      const { data: subscription, error: lookupError } = await admin
        .from('subscriptions')
        .select('id, user_id, plan_id, status')
        .eq('asaas_subscription_id', payment.subscription)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!subscription) {
        return { outcome: 'unknown_subscription' };
      }

      if (ACTIVATE_EVENTS.has(event)) {
        if (subscription.status === 'canceled') return { outcome: 'applied', status: 'ignored' };
        const { error: updateError } = await admin
          .from('subscriptions')
          .update({ status: 'active', next_due_date: payment.dueDate ?? null })
          .eq('id', subscription.id);
        if (updateError) throw updateError;
        // Service role performs the paid plan update; the browser cannot do it.
        const { error: profileError } = await admin.from('user_profiles').update({ plan_id: subscription.plan_id }).eq('id', subscription.user_id);
        if (profileError) throw profileError;
        return { outcome: 'applied', status: 'active' };
      }
      if (OVERDUE_EVENTS.has(event)) {
        if (subscription.status === 'canceled') return { outcome: 'applied', status: 'ignored' };
        const { error: updateError } = await admin.from('subscriptions').update({ status: 'overdue' }).eq('id', subscription.id);
        if (updateError) throw updateError;
        return { outcome: 'applied', status: 'overdue' };
      }
      if (CANCEL_EVENTS.has(event)) {
        const { error: updateError } = await admin.from('subscriptions').update({ status: 'canceled' }).eq('id', subscription.id);
        if (updateError) throw updateError;
        await resetSubscriptionProfile(admin, subscription);
        return { outcome: 'applied', status: 'canceled' };
      }
      return { outcome: 'applied', status: 'ignored' };
    } catch (error) {
      // A failed subscription write must be retriable, not permanently deduped.
      const { error: cleanupError } = await admin.from('asaas_webhook_events').delete()
        .eq('payment_id', payment.id).eq('event', event);
      if (cleanupError) console.error('[asaas/subscription] dedup cleanup failed', cleanupError);
      throw error;
    }
  }

  // Sem `subscription`: pode ser cobrança avulsa de taxa de inscrição
  // (migration 078, createAsaasPayment) — casada pelo id do pagamento salvo
  // em tournament_registrations.asaas_payment_id na hora da cobrança.
  const { data: registration } = await admin
    .from('tournament_registrations')
    .select('id')
    .eq('asaas_payment_id', payment.id)
    .maybeSingle();
  if (!registration) {
    // Também pode ser cobrança de um pedido de relatório (report_orders).
    const { data: reportOrder } = await admin
      .from('report_orders')
      .select('id, status')
      .eq('asaas_payment_id', payment.id)
      .maybeSingle();
    if (!reportOrder) return { outcome: 'unmatched' };
    const kind = ACTIVATE_EVENTS.has(event) ? 'activate' : OVERDUE_EVENTS.has(event) ? 'overdue' : CANCEL_EVENTS.has(event) ? 'cancel' : null;
    const patch = kind ? reportOrderPatchForPayment(kind, reportOrder.status) : null;
    if (!patch) return { outcome: 'applied', status: 'ignored' };
    await admin.from('report_orders').update(patch).eq('id', reportOrder.id);
    return { outcome: 'applied', status: patch.payment_status };
  }

  if (ACTIVATE_EVENTS.has(event)) {
    // Guarda bruto e líquido do pagamento para a conciliação do repasse ao organizador.
    await admin.from('tournament_registrations')
      .update({ payment_status: 'paid', ...paidRegistrationFields(payment) }).eq('id', registration.id);
    return { outcome: 'applied', status: 'paid' };
  }
  if (OVERDUE_EVENTS.has(event)) {
    await admin.from('tournament_registrations').update({ payment_status: 'overdue' }).eq('id', registration.id);
    return { outcome: 'applied', status: 'overdue' };
  }
  if (CANCEL_EVENTS.has(event)) {
    await admin.from('tournament_registrations').update({ payment_status: 'refunded' }).eq('id', registration.id);
    return { outcome: 'applied', status: 'refunded' };
  }
  return { outcome: 'applied', status: 'ignored' };
}
