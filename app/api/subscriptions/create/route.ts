import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  createAsaasCustomer,
  createAsaasSubscription,
  cancelAsaasSubscription,
  getLatestSubscriptionPayment,
  type AsaasBillingType,
  type AsaasCycle,
} from '@/lib/asaas/client';
import { todayInBrazil } from '@/lib/utils/date';
import { getSubscriptionBillingAvailability } from '@/lib/data/billing';
import { subscriptionSalesAllowed } from '@/lib/billing/organizer';

// Cria a assinatura recorrente na Asaas pro plano escolhido e devolve o link
// da primeira cobrança (invoiceUrl — checkout hospedado da Asaas, onde o
// pagador escolhe PIX ou cartão). O plano só passa a valer de fato quando o
// webhook (app/api/webhooks/asaas/route.ts) confirmar o pagamento — esta
// rota só inicia a cobrança, não libera nada em user_profiles.plan_id.

const CYCLE_BY_INTERVAL: Record<string, AsaasCycle> = { month: 'MONTHLY', year: 'YEARLY' };
const schema = z.object({
  planCode: z.string().trim().min(1).max(50),
  billingType: z.enum(['PIX', 'CREDIT_CARD', 'UNDEFINED']).optional(),
  cpfCnpj: z.string().transform((value) => value.replace(/\D/g, ''))
    .refine((value) => value.length === 11 || value.length === 14).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.is_anonymous) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados da assinatura inválidos. Confira o plano e o CPF/CNPJ.' }, { status: 400 });
  }
  const { planCode, billingType, cpfCnpj } = parsed.data;
  try {
    const { globalBilling, organizerBilling, playerHistoryBilling } = await getSubscriptionBillingAvailability();
    if (!subscriptionSalesAllowed(planCode, globalBilling, organizerBilling, playerHistoryBilling)) {
      return NextResponse.json({ error: 'A contratação deste plano está desativada.' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível verificar a disponibilidade da assinatura.' }, { status: 503 });
  }
  const type: AsaasBillingType =
    billingType === 'PIX' || billingType === 'CREDIT_CARD' ? billingType : 'UNDEFINED';

  const admin = createAdminClient();

  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, code, name, price_cents, billing_interval')
    .eq('code', planCode)
    .eq('is_public', true)
    .maybeSingle();
  if (planError) return NextResponse.json({ error: 'Não foi possível consultar o plano.' }, { status: 503 });
  if (!plan) {
    return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });
  }
  if (!plan.price_cents || plan.price_cents <= 0 || !plan.billing_interval) {
    return NextResponse.json(
      { error: 'Este plano ainda não tem preço/ciclo definido — fale com o suporte.' },
      { status: 422 }
    );
  }
  const cycle = CYCLE_BY_INTERVAL[plan.billing_interval];
  if (!cycle) {
    return NextResponse.json(
      { error: `billing_interval desconhecido: ${plan.billing_interval}` },
      { status: 422 }
    );
  }

  const { data: existing, error: existingError } = await admin.from('subscriptions')
    .select('asaas_subscription_id, status').eq('user_id', user.id).eq('plan_id', plan.id)
    .in('status', ['pending', 'active', 'overdue']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existingError) return NextResponse.json({ error: 'Não foi possível consultar sua assinatura.' }, { status: 503 });
  if (existing?.status === 'active') {
    return NextResponse.json({ error: 'Sua assinatura deste plano já está ativa.' }, { status: 409 });
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('id, full_name, email, asaas_customer_id, cpf_cnpj')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  const document: string | undefined = cpfCnpj || profile.cpf_cnpj || undefined;
  const customerEmail = profile.email || user.email;
  let asaasCustomerId: string | null = profile.asaas_customer_id;
  if (!asaasCustomerId && !document) {
    return NextResponse.json(
      { error: 'CPF/CNPJ é obrigatório para criar a assinatura.' },
      { status: 400 }
    );
  }
  if (!asaasCustomerId && !customerEmail) {
    return NextResponse.json({ error: 'E-mail é obrigatório para criar a assinatura.' }, { status: 400 });
  }

  try {
    // Retry resumes the same invoice instead of selling a second recurrence.
    if (existing) {
      const payment = await getLatestSubscriptionPayment(existing.asaas_subscription_id);
      return NextResponse.json({ subscriptionId: existing.asaas_subscription_id, invoiceUrl: payment?.invoiceUrl ?? null });
    }
    if (!asaasCustomerId) {
      const customer = await createAsaasCustomer({
        name: profile.full_name || profile.email || 'Cliente Gambito Torneios',
        email: customerEmail!,
        cpfCnpj: document!,
      });
      asaasCustomerId = customer.id;
      const { error: customerError } = await admin
        .from('user_profiles')
        .update({ asaas_customer_id: asaasCustomerId, cpf_cnpj: document })
        .eq('id', user.id);
      if (customerError) throw new Error('Não foi possível salvar os dados da cobrança.');
    }

    const subscription = await createAsaasSubscription({
      customer: asaasCustomerId,
      billingType: type,
      value: plan.price_cents / 100,
      cycle,
      nextDueDate: todayInBrazil(),
      description: `Gambito Torneios — plano ${plan.name}`,
    });

    const { error: insertError } = await admin.from('subscriptions').insert({
      user_id: user.id,
      plan_id: plan.id,
      asaas_subscription_id: subscription.id,
      status: 'pending',
      billing_type: type,
      next_due_date: todayInBrazil(),
    });
    if (insertError) {
      console.error('[subscriptions/create] insert falhou:', insertError);
      // The unique index also catches simultaneous checkouts. Undo only the
      // recurrence created by this request, never somebody else's subscription.
      try {
        await cancelAsaasSubscription(subscription.id);
      } catch {
        return NextResponse.json({ error: 'Falha ao concluir a assinatura. Procure o suporte antes de tentar novamente.' }, { status: 502 });
      }
      return NextResponse.json({ error: insertError.code === '23505' ? 'Já existe uma assinatura em processamento. Atualize a página para continuar.' : 'Não foi possível registrar a assinatura. Tente novamente.' }, { status: insertError.code === '23505' ? 409 : 500 });
    }

    const firstPayment = await getLatestSubscriptionPayment(subscription.id);

    return NextResponse.json({
      subscriptionId: subscription.id,
      invoiceUrl: firstPayment?.invoiceUrl ?? null,
    });
  } catch (err) {
    console.error('[subscriptions/create]', err);
    const message = err instanceof Error ? err.message : 'Erro ao criar assinatura na Asaas.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
