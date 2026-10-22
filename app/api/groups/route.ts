import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Grupos de jogadores da própria conta. Cliente da sessão: a policy
// player_groups_own garante que cada conta só mexe nos seus.

const KINDS = ['club', 'school', 'coach'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login para criar um grupo.' }, { status: 401 });
  const { name, kind } = await request.json().catch(() => ({}));
  const cleanName = String(name ?? '').trim().slice(0, 80);
  if (!cleanName) return NextResponse.json({ error: 'Dê um nome ao grupo.' }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('player_groups')
    .insert({ owner_id: user.id, name: cleanName, kind: KINDS.includes(kind) ? kind : 'club' })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('player_groups').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
