import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  createAsaasCustomer,
  createAsaasSubscription,
  getLatestSubscriptionPayment,
  type AsaasBillingType,
  type AsaasCycle,
} from '@/lib/asaas/client';
import { todayInSaoPaulo } from '@/lib/utils/chess';

// Cria a assinatura recorrente na Asaas pro plano escolhido e devolve o link
// da primeira cobrança (invoiceUrl — checkout hospedado da Asaas, onde o
// pagador escolhe PIX ou cartão). O plano só passa a valer de fato quando o
// webhook (app/api/webhooks/asaas/route.ts) confirmar o pagamento — esta
// rota só inicia a cobrança, não libera nada em user_profiles.plan_id.

const CYCLE_BY_INTERVAL: Record<string, AsaasCycle> = { month: 'MONTHLY', year: 'YEARLY' };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { planCode, billingType, cpfCnpj } = await request.json().catch(() => ({}));
  if (!planCode || typeof planCode !== 'string') {
    return NextResponse.json({ error: 'planCode inválido.' }, { status: 400 });
  }
  const type: AsaasBillingType =
    billingType === 'PIX' || billingType === 'CREDIT_CARD' ? billingType : 'UNDEFINED';

  const admin = createAdminClient();

  const { data: plan } = await admin
    .from('plans')
    .select('id, code, name, price_cents, billing_interval')
    .eq('code', planCode)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: 'Plano não encontrado.' }, { status: 404 });
  }
  if (!plan.price_cents || !plan.billing_interval) {
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

  const { data: profile } = await admin
    .from('user_profiles')
    .select('id, full_name, email, asaas_customer_id, cpf_cnpj')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  }

  const document: string | undefined = cpfCnpj || profile.cpf_cnpj || undefined;
  let asaasCustomerId: string | null = profile.asaas_customer_id;
  if (!asaasCustomerId && !document) {
    return NextResponse.json(
      { error: 'CPF/CNPJ é obrigatório para criar a assinatura.' },
      { status: 400 }
    );
  }

  try {
    if (!asaasCustomerId) {
      const customer = await createAsaasCustomer({
        name: profile.full_name || profile.email || 'Cliente Xadrez BR',
        email: profile.email,
        cpfCnpj: document!,
      });
      asaasCustomerId = customer.id;
      await admin
        .from('user_profiles')
        .update({ asaas_customer_id: asaasCustomerId, cpf_cnpj: document })
        .eq('id', user.id);
    }

    const subscription = await createAsaasSubscription({
      customer: asaasCustomerId,
      billingType: type,
      value: plan.price_cents / 100,
      cycle,
      nextDueDate: todayInSaoPaulo(),
      description: `Xadrez BR — plano ${plan.name}`,
    });

    const firstPayment = await getLatestSubscriptionPayment(subscription.id);

    const { error: insertError } = await admin.from('subscriptions').insert({
      user_id: user.id,
      plan_id: plan.id,
      asaas_subscription_id: subscription.id,
      status: 'pending',
      billing_type: type,
      next_due_date: firstPayment?.dueDate ?? null,
    });
    if (insertError) {
      console.error('[subscriptions/create] insert falhou:', insertError);
      return NextResponse.json({ error: 'Assinatura criada na Asaas, mas falhou ao registrar localmente.' }, { status: 500 });
    }

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
