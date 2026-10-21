import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { findOwnChatSession } from '@/lib/chat/session-access';

export const runtime = 'nodejs';

/** Marca uma conversa como lida pelo dono (caixa de mensagens em /minha-area/mensagens). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sessionId: unknown = body?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) return NextResponse.json({ error: 'sessionId obrigatório.' }, { status: 400 });

  const admin = createAdminClient();
  const own = await findOwnChatSession<{ id: string }>(admin, sessionId, user.id, 'id');
  if (!own) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });

  const { error } = await admin.from('chat_sessions').update({ user_last_read_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
