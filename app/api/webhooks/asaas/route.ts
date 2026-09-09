import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { applyAsaasPaymentEvent, type AsaasPaymentEvent } from '@/lib/asaas/webhook-handler';

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

  const body: Partial<AsaasPaymentEvent> | null = await request.json().catch(() => null);
  if (!body?.event || !body.payment?.id) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const result = await applyAsaasPaymentEvent(admin, body as AsaasPaymentEvent);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[webhooks/asaas]', err);
    return NextResponse.json({ error: 'Erro ao processar evento.' }, { status: 500 });
  }
}
