import type { SupabaseClient } from '@supabase/supabase-js';

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
  };
}

const ACTIVATE_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE']);
const CANCEL_EVENTS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_DELETED', 'PAYMENT_CHARGEBACK_REQUESTED']);

export type ApplyEventResult =
  | { outcome: 'duplicate' }
  | { outcome: 'no_subscription' }
  | { outcome: 'unknown_subscription' }
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

  if (!payment.subscription) {
    return { outcome: 'no_subscription' };
  }

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, user_id, plan_id')
    .eq('asaas_subscription_id', payment.subscription)
    .maybeSingle();
  if (!subscription) {
    return { outcome: 'unknown_subscription' };
  }

  if (ACTIVATE_EVENTS.has(event)) {
    await admin
      .from('subscriptions')
      .update({ status: 'active', next_due_date: payment.dueDate ?? null })
      .eq('id', subscription.id);
    // UPDATE direto, não via RPC set_user_plan: aquele RPC exige
    // auth_user_role() = 'admin', e o client service_role usado aqui não
    // autentica como usuário nenhum (auth.uid() nulo) — é o contexto que
    // trg_prevent_plan_self_upgrade (migration 073) já deixa passar sem
    // checar admin, pensado exatamente pra webhook de cobrança.
    await admin.from('user_profiles').update({ plan_id: subscription.plan_id }).eq('id', subscription.user_id);
    return { outcome: 'applied', status: 'active' };
  }
  if (OVERDUE_EVENTS.has(event)) {
    await admin.from('subscriptions').update({ status: 'overdue' }).eq('id', subscription.id);
    return { outcome: 'applied', status: 'overdue' };
  }
  if (CANCEL_EVENTS.has(event)) {
    await admin.from('subscriptions').update({ status: 'canceled' }).eq('id', subscription.id);
    const { data: freePlan } = await admin.from('plans').select('id').eq('code', 'free').maybeSingle();
    if (freePlan) {
      await admin.from('user_profiles').update({ plan_id: freePlan.id }).eq('id', subscription.user_id);
    }
    return { outcome: 'applied', status: 'canceled' };
  }

  return { outcome: 'applied', status: 'ignored' };
}
