import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canDeliver, type ReportOrderStatus, type ReportPaymentStatus } from '@/lib/reports/orders';

// Link temporário (60 s) do PDF entregue. O arquivo vive num bucket privado e
// só o dono do pedido, ou um admin, recebe o link — nunca uma URL fixa.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('report_orders')
    .select('id, user_id, status, price_cents, payment_status, delivery_path')
    .eq('id', id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });

  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = profile?.role === 'admin';
  if (order.user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  }
  if (order.status !== 'delivered' || !order.delivery_path) {
    return NextResponse.json({ error: 'O relatório ainda não foi entregue.' }, { status: 409 });
  }
  if (!isAdmin && !canDeliver({
    priceCents: order.price_cents, paymentStatus: order.payment_status as ReportPaymentStatus, status: order.status as ReportOrderStatus,
  })) {
    return NextResponse.json({ error: 'Pagamento não confirmado.' }, { status: 402 });
  }

  const { data: signed, error } = await admin.storage
    .from('reports').createSignedUrl(order.delivery_path, 60, { download: `relatorio-${order.id}.pdf` });
  if (error || !signed?.signedUrl) {
    console.error('[reports/download]', error);
    return NextResponse.json({ error: 'Não foi possível gerar o link do arquivo.' }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
