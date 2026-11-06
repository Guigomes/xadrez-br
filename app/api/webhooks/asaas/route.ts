import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { applyAsaasPaymentEvent, applyAsaasSubscriptionEvent, type AsaasPaymentEvent, type AsaasSubscriptionEvent } from '@/lib/asaas/webhook-handler';

// Recebe eventos de cobrança da Asaas e sincroniza `subscriptions` +
// `user_profiles.plan_id` (via lib/asaas/webhook-handler.ts). Autenticado
// pelo header `asaas-access-token` — o valor é o "Token de acesso" cadastrado
// no painel Asaas (Integrações > Webhooks), não um segredo gerado aqui; a
// Asaas devolve o mesmo valor em toda chamada.

const TOKEN_HEADER = 'asaas-access-token';

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'ASAAS_WEBHOOK_TOKEN não configurado no servidor.' }, { status: 500 });
  }
  if (request.headers.get(TOKEN_HEADER) !== expectedToken) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const body: (Partial<AsaasPaymentEvent> & Partial<AsaasSubscriptionEvent>) | null = await request.json().catch(() => null);
  const lifecycle = typeof body?.event === 'string' && body.event.startsWith('SUBSCRIPTION_');
  if (typeof body?.event !== 'string' || (lifecycle ? typeof body.subscription?.id !== 'string' : typeof body.payment?.id !== 'string')) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const result = lifecycle
      ? await applyAsaasSubscriptionEvent(admin, body as AsaasSubscriptionEvent)
      : await applyAsaasPaymentEvent(admin, body as AsaasPaymentEvent);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[webhooks/asaas]', err);
    return NextResponse.json({ error: 'Erro ao processar evento.' }, { status: 500 });
  }
}
