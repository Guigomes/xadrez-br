import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createAsaasCustomer, createAsaasPayment, type AsaasBillingType } from '@/lib/asaas/client';
import { isBillingEnabled } from '@/lib/data/billing';
import { todayInSaoPaulo } from '@/lib/utils/chess';
import { initialOrderState, isValidCpfCnpjShape, resolveReportCharge } from '@/lib/reports/orders';
import { loadReportCandidates } from '@/lib/reports/candidates';

// Pedido de relatório de desempenho (plano de monetização, frente 1).
// Regras que esta rota garante, e que o cliente não pode contornar:
//  - só usuário logado, e só de jogador com vínculo VERIFICADO na conta
//    (user_player_links) — nunca por nome;
//  - o jogador precisa ter de fato jogado o torneio pedido, com ao menos uma
//    partida com lances (PGN) — sem lances não há relatório;
//  - aceite do responsável é obrigatório (muitos jogadores são menores);
//  - preço e cobrança vêm do servidor (app_settings + billing_enabled), nunca
//    do corpo da requisição.

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login para pedir um relatório.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { playerId, tournamentId, historyTournamentId, guardianConsent, cpfCnpj, billingType } = body as {
    playerId?: string; tournamentId?: string; historyTournamentId?: string;
    guardianConsent?: boolean; cpfCnpj?: string; billingType?: string;
  };

  if (!playerId || (!tournamentId && !historyTournamentId) || (tournamentId && historyTournamentId)) {
    return NextResponse.json({ error: 'Informe o jogador e um torneio.' }, { status: 400 });
  }
  if (guardianConsent !== true) {
    return NextResponse.json(
      { error: 'É preciso confirmar que o jogador, ou o responsável legal, autoriza o relatório.' },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: link } = await admin
    .from('user_player_links').select('player_id')
    .eq('user_id', user.id).eq('player_id', playerId).eq('status', 'verified').maybeSingle();
  if (!link) {
    return NextResponse.json({ error: 'Este jogador não está vinculado à sua conta.' }, { status: 403 });
  }

  const kind = tournamentId ? 'live' : 'history';
  const wanted = tournamentId ?? historyTournamentId;
  const candidate = (await loadReportCandidates(admin, [playerId]))
    .find((c) => c.kind === kind && c.tournamentId === wanted);
  if (!candidate) {
    return NextResponse.json({ error: 'Este jogador não participou do torneio escolhido.' }, { status: 422 });
  }
  if (!candidate.pgnGames) {
    return NextResponse.json(
      { error: 'Nenhuma partida deste jogador no torneio tem os lances registrados, então não há o que analisar.' },
      { status: 422 }
    );
  }
  const tournamentName = candidate.name;

  const [billingEnabled, { data: setting }] = await Promise.all([
    isBillingEnabled(),
    admin.from('app_settings').select('value').eq('key', 'report_price_cents').maybeSingle(),
  ]);
  const charge = resolveReportCharge(billingEnabled, Number(setting?.value));
  const state = initialOrderState(charge);

  if (charge.charge && !isValidCpfCnpjShape(String(cpfCnpj ?? ''))) {
    return NextResponse.json({ error: 'CPF ou CNPJ válido é obrigatório para pagar o relatório.' }, { status: 400 });
  }

  const { data: order, error: insertError } = await admin
    .from('report_orders')
    .insert({
      user_id: user.id,
      player_id: playerId,
      tournament_id: tournamentId ?? null,
      history_tournament_id: historyTournamentId ?? null,
      tournament_name: tournamentName,
      status: state.status,
      payment_status: state.paymentStatus,
      price_cents: charge.priceCents,
      guardian_consent: true,
    })
    .select('id')
    .single();
  if (insertError || !order) {
    if ((insertError as { code?: string } | null)?.code === '23505') {
      return NextResponse.json({ error: 'Você já tem um pedido ativo para este jogador e torneio.' }, { status: 409 });
    }
    console.error('[reports/orders] insert falhou:', insertError);
    return NextResponse.json({ error: 'Não foi possível registrar o pedido.' }, { status: 500 });
  }

  if (!charge.charge) {
    return NextResponse.json({ orderId: order.id, invoiceUrl: null });
  }

  const type: AsaasBillingType = billingType === 'PIX' || billingType === 'CREDIT_CARD' ? billingType : 'UNDEFINED';
  try {
    const { data: profile } = await admin
      .from('user_profiles').select('full_name, email, asaas_customer_id').eq('id', user.id).single();
    const email = profile?.email || user.email;
    if (!email) {
      await admin.from('report_orders').update({ status: 'canceled' }).eq('id', order.id);
      return NextResponse.json({ error: 'E-mail é obrigatório para pagar o relatório.' }, { status: 400 });
    }
    let customerId: string | null = profile?.asaas_customer_id ?? null;
    if (!customerId) {
      const customer = await createAsaasCustomer({
        name: profile?.full_name || email, email, cpfCnpj: String(cpfCnpj).replace(/\D/g, ''),
      });
      customerId = customer.id;
      await admin.from('user_profiles')
        .update({ asaas_customer_id: customerId, cpf_cnpj: String(cpfCnpj).replace(/\D/g, '') }).eq('id', user.id);
    }
    const payment = await createAsaasPayment({
      customer: customerId,
      billingType: type,
      value: charge.priceCents / 100,
      dueDate: todayInSaoPaulo(),
      description: `Relatório de desempenho — ${tournamentName}`,
    });
    await admin.from('report_orders').update({
      asaas_customer_id: customerId, asaas_payment_id: payment.id, asaas_invoice_url: payment.invoiceUrl,
    }).eq('id', order.id);
    return NextResponse.json({ orderId: order.id, invoiceUrl: payment.invoiceUrl });
  } catch (err) {
    // Cobrança não nasceu: cancela o pedido para o usuário poder tentar de novo
    // (o índice de pedido ativo único não pode prender quem falhou no pagamento).
    await admin.from('report_orders').update({ status: 'canceled' }).eq('id', order.id);
    console.error('[reports/orders] cobrança falhou:', err);
    const message = err instanceof Error ? err.message : 'Erro ao criar a cobrança.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
