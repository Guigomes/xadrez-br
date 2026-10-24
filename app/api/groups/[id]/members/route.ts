import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Membros de um grupo da própria conta. Cliente da sessão: a policy
// player_group_members_own só deixa o dono do grupo mexer, e o trigger
// enforce_group_players_limit aplica o limite do plano.

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase: supabase, user };
}

function fail(error: { message?: string; code?: string }) {
  if (error.message?.includes('PLAN_LIMIT')) {
    return NextResponse.json({ error: error.message.replace(/^.*PLAN_LIMIT:\s*/, 'Limite do plano: ') }, { status: 403 });
  }
  if (error.code === '42501') return NextResponse.json({ error: 'Grupo não encontrado.' }, { status: 404 });
  if (error.code === '23505') return NextResponse.json({ error: 'Este jogador já está no grupo.' }, { status: 409 });
  return NextResponse.json({ error: error.message ?? 'Erro ao salvar.' }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await session();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { playerId } = await request.json().catch(() => ({}));
  if (!playerId) return NextResponse.json({ error: 'Escolha um jogador.' }, { status: 400 });
  const { error } = await supabase.from('player_group_members').insert({ group_id: id, player_id: playerId });
  if (error) return fail(error);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await session();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { playerId, note } = await request.json().catch(() => ({}));
  if (!playerId) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const clean = typeof note === 'string' ? note.trim().slice(0, 2000) || null : null;
  const { data, error } = await supabase
    .from('player_group_members').update({ note: clean }).eq('group_id', id).eq('player_id', playerId).select('player_id');
  if (error) return fail(error);
  if (!data?.length) return NextResponse.json({ error: 'Jogador não está no grupo.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await session();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { playerId } = await request.json().catch(() => ({}));
  if (!playerId) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const { error } = await supabase.from('player_group_members').delete().eq('group_id', id).eq('player_id', playerId);
  if (error) return fail(error);
  return NextResponse.json({ ok: true });
}
