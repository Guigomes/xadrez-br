import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ADMIN_SETTABLE_STATUSES, type ReportOrderStatus } from '@/lib/reports/orders';

// Admin: muda o andamento de um pedido (em produção / cancelado) e as
// observações. Entrega e pagamento têm caminhos próprios (/deliver e webhook).

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const { status, notes } = (await request.json().catch(() => ({}))) as { status?: ReportOrderStatus; notes?: string };
  const patch: { status?: ReportOrderStatus; notes?: string } = {};
  if (status !== undefined) {
    if (!ADMIN_SETTABLE_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Status inválido para alteração manual.' }, { status: 400 });
    }
    patch.status = status;
  }
  if (notes !== undefined) patch.notes = String(notes).slice(0, 2000);
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });

  const { data, error } = await admin.from('report_orders').update(patch).eq('id', id).select('id, status, notes').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  return NextResponse.json(data);
}
