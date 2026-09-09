import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { applyAsaasPaymentEvent } from '@/lib/asaas/webhook-handler';
import { todayInSaoPaulo } from '@/lib/utils/chess';

// Simula a Asaas confirmando o pagamento — só existe pra exercitar o fluxo
// de assinatura sem conta Asaas real. Some sozinha assim que ASAAS_API_KEY
// for preenchida: em modo real, quem confirma pagamento é a Asaas via
// webhook assinado, nunca o próprio navegador do usuário.

export async function POST(request: NextRequest) {
  if (process.env.ASAAS_API_KEY) {
    return NextResponse.json({ error: 'Mock desativado — ASAAS_API_KEY já configurada.' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { subscriptionId } = await request.json().catch(() => ({}));
  if (!subscriptionId || typeof subscriptionId !== 'string') {
    return NextResponse.json({ error: 'subscriptionId inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Só o dono da assinatura pode "pagar" — mesmo em mock, não deixa
  // confirmar assinatura de outro usuário adivinhando o id.
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('id, user_id, asaas_subscription_id')
    .eq('asaas_subscription_id', subscriptionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!subscription) {
    return NextResponse.json({ error: 'Assinatura não encontrada.' }, { status: 404 });
  }

  try {
    const result = await applyAsaasPaymentEvent(admin, {
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: `pay_mock_confirm_${Date.now()}`,
        subscription: subscription.asaas_subscription_id,
        dueDate: todayInSaoPaulo(),
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[mock/asaas-confirm]', err);
    return NextResponse.json({ error: 'Erro ao simular confirmação.' }, { status: 500 });
  }
}
