import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createAsaasCustomer, createAsaasPayment, type AsaasBillingType } from '@/lib/asaas/client';
import { todayInSaoPaulo } from '@/lib/utils/chess';

// Inicia a cobrança avulsa da taxa de inscrição (migration 078) — chamada
// pelo próprio formulário público logo após o insert em
// tournament_registrations (sem login: o id da inscrição, um uuid
// imprevisível, funciona como o "bearer" da operação, mesmo padrão já usado
// por /mock-checkout/[subscriptionId]). O valor e a obrigatoriedade vêm do
// torneio, nunca do corpo da requisição — quem decide se a inscrição
// precisa pagar é o trigger enforce_registration_payment_status (078), que
// já gravou payment_status='pending' no insert.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { billingType } = await request.json().catch(() => ({}));
  const type: AsaasBillingType =
    billingType === 'PIX' || billingType === 'CREDIT_CARD' ? billingType : 'UNDEFINED';

  const admin = createAdminClient();

  const { data: registration } = await admin
    .from('tournament_registrations')
    .select('id, tournament_id, full_name, email, cpf_cnpj, payment_status, asaas_customer_id, asaas_invoice_url')
    .eq('id', id)
    .maybeSingle();
  if (!registration) {
    return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
  }
  if (registration.payment_status !== 'pending') {
    return NextResponse.json({ error: 'Esta inscrição não está aguardando pagamento.' }, { status: 409 });
  }
  // Cobrança já iniciada antes (retry do usuário) — devolve o mesmo link
  // em vez de gerar uma segunda cobrança pra mesma inscrição.
  if (registration.asaas_invoice_url) {
    return NextResponse.json({ invoiceUrl: registration.asaas_invoice_url });
  }
  if (!registration.cpf_cnpj || !registration.email) {
    return NextResponse.json(
      { error: 'CPF/CNPJ e e-mail são obrigatórios para pagar a inscrição.' },
      { status: 400 }
    );
  }

  const { data: tournament } = await admin
    .from('tournaments')
    .select('name, registration_fee_cents')
    .eq('id', registration.tournament_id)
    .single();
  if (!tournament?.registration_fee_cents) {
    return NextResponse.json({ error: 'Torneio sem valor de inscrição configurado.' }, { status: 422 });
  }

  try {
    let asaasCustomerId = registration.asaas_customer_id;
    if (!asaasCustomerId) {
      const customer = await createAsaasCustomer({
        name: registration.full_name,
        email: registration.email,
        cpfCnpj: registration.cpf_cnpj,
      });
      asaasCustomerId = customer.id;
    }

    const payment = await createAsaasPayment({
      customer: asaasCustomerId,
      billingType: type,
      value: tournament.registration_fee_cents / 100,
      dueDate: todayInSaoPaulo(),
      description: `Inscrição — ${tournament.name}`,
    });

    await admin
      .from('tournament_registrations')
      .update({
        asaas_customer_id: asaasCustomerId,
        asaas_payment_id: payment.id,
        asaas_invoice_url: payment.invoiceUrl,
      })
      .eq('id', id);

    return NextResponse.json({ invoiceUrl: payment.invoiceUrl });
  } catch (err) {
    console.error('[registrations/pay]', err);
    const message = err instanceof Error ? err.message : 'Erro ao criar cobrança na Asaas.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
