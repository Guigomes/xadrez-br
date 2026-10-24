import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UFS } from '@/lib/alerts/match';

// Regras de alerta do próprio usuário. Cliente da sessão (sem service_role):
// a policy tournament_alert_rules_own garante que cada um só mexe nas suas e
// o trigger enforce_alert_rule_limit aplica o limite do plano.

const TCS = ['std', 'rpd', 'blz'];

function clean(body: Record<string, unknown>) {
  const ufs = Array.isArray(body.ufs) ? [...new Set(body.ufs.map(String).filter((u) => (UFS as readonly string[]).includes(u)))] : [];
  const timeControls = Array.isArray(body.timeControls) ? [...new Set(body.timeControls.map(String).filter((t) => TCS.includes(t)))] : [];
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) || null : null;
  return { ufs, time_controls: timeControls, include_cbx: body.includeCbx !== false, name };
}

function limitError(error: { message?: string; code?: string }) {
  if (error.message?.includes('PLAN_LIMIT')) {
    return NextResponse.json({ error: error.message.replace(/^.*PLAN_LIMIT:\s*/, 'Limite do plano: ') }, { status: 403 });
  }
  return NextResponse.json({ error: error.message ?? 'Erro ao salvar o alerta.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login para criar alertas.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { error } = await supabase.from('tournament_alert_rules').insert({ user_id: user.id, ...clean(body) });
  if (error) return limitError(error);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { id, active } = await request.json().catch(() => ({}));
  if (!id || typeof active !== 'boolean') return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const { error } = await supabase.from('tournament_alert_rules').update({ active }).eq('id', id);
  if (error) return limitError(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const { error } = await supabase.from('tournament_alert_rules').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
