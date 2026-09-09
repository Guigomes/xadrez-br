import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { refundAsaasPayment } from '@/lib/asaas/client';

// Rejeita uma inscrição pendente. Se ela já tinha sido paga online
// (migration 078), estorna na Asaas ANTES de marcar como rejeitada — dinheiro
// não pode ficar preso: se o estorno falhar, a rejeição inteira falha junto
// (a inscrição continua pendente), pro organizador tentar de novo em vez de
// a inscrição sumir da fila com o pagamento intacto na Asaas.
// Substitui a antiga rejeição direto do client (lib/hooks/use-registrations.ts) porque
// o estorno exige a ASAAS_API_KEY, que só existe no servidor.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { reason } = await request.json().catch(() => ({}));

  const admin = createAdminClient();
  const { data: registration } = await admin
    .from('tournament_registrations')
    .select('id, tournament_id, status, payment_status, asaas_payment_id')
    .eq('id', id)
    .maybeSingle();
  if (!registration) {
    return NextResponse.json({ error: 'Inscrição não encontrada.' }, { status: 404 });
  }

  const { data: isOrganizer } = await supabase.rpc('is_tournament_organizer', {
    p_tournament_id: registration.tournament_id,
  });
  if (!isOrganizer) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
  }
  if (registration.status !== 'pending') {
    return NextResponse.json({ error: 'Inscrição não está pendente.' }, { status: 409 });
  }

  let paymentStatus = registration.payment_status;
  if (registration.payment_status === 'paid' && registration.asaas_payment_id) {
    try {
      await refundAsaasPayment(registration.asaas_payment_id);
      paymentStatus = 'refunded';
    } catch (err) {
      console.error('[registrations/reject] estorno falhou:', err);
      const message = err instanceof Error ? err.message : 'Falha ao estornar pagamento na Asaas.';
      return NextResponse.json(
        { error: `Não foi possível rejeitar: estorno na Asaas falhou (${message}). Tente novamente.` },
        { status: 502 }
      );
    }
  }

  const { error: updErr } = await admin
    .from('tournament_registrations')
    .update({ status: 'rejected', rejected_reason: reason || null, payment_status: paymentStatus })
    .eq('id', id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, refunded: paymentStatus === 'refunded' });
}
