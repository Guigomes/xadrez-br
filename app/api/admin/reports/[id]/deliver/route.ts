import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { canDeliver } from '@/lib/reports/orders';

// Admin: anexa o PDF pronto ao pedido e marca como entregue. Recusa pedido
// cobrado e ainda não pago (canDeliver) — o arquivo só sai depois do pagamento.

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const { data: order } = await admin
    .from('report_orders').select('id, status, price_cents, payment_status').eq('id', id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  if (!canDeliver({ priceCents: order.price_cents, paymentStatus: order.payment_status, status: order.status })) {
    return NextResponse.json({ error: 'Pedido cancelado ou ainda sem pagamento confirmado.' }, { status: 409 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie o PDF no campo "file".' }, { status: 400 });
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'O arquivo precisa ser um PDF.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'PDF maior que 15 MB.' }, { status: 413 });

  const path = `${order.id}.pdf`;
  const { error: uploadError } = await admin.storage
    .from('reports').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: 'application/pdf', upsert: true });
  if (uploadError) {
    console.error('[admin/reports/deliver] upload:', uploadError);
    return NextResponse.json({ error: 'Falha ao guardar o PDF.' }, { status: 500 });
  }

  const { error } = await admin
    .from('report_orders')
    .update({ status: 'delivered', delivery_path: path, delivered_at: new Date().toISOString() })
    .eq('id', order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
