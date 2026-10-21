import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendUserNotification } from '@/lib/push';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Admin começa uma conversa com um usuário (/admin/dev/chat → "Nova mensagem").
 * Mesma convenção das respostas humanas (/api/chat/reply): a mensagem sai como Gambito
 * (role='assistant', is_human=true). A conversa nasce com status 'humano', então o que o
 * usuário responder vem para o admin, sem o bot no meio (/api/chat/message).
 * O usuário vê em /minha-area/mensagens e recebe push se tiver notificações ligadas.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId: unknown = body?.userId;
  const message: unknown = body?.message;
  if (typeof userId !== 'string' || !userId) return NextResponse.json({ error: 'Escolha o destinatário.' }, { status: 400 });
  if (typeof message !== 'string' || !message.trim()) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres).` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from('user_profiles').select('id').eq('id', userId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

  const now = new Date().toISOString();
  const { data: session, error: sessionError } = await admin
    .from('chat_sessions')
    .insert({ user_id: userId, status: 'humano', started_by: user.id, last_message_at: now, user_last_read_at: null })
    .select('id')
    .single();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const { error: msgError } = await admin
    .from('chat_messages')
    .insert({ session_id: session.id, role: 'assistant', content: message.trim(), is_human: true });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  try {
    await sendUserNotification(userId, {
      title: 'Nova mensagem do Gambito',
      body: message.trim().slice(0, 140),
      url: `/minha-area/mensagens/${session.id}`,
    });
  } catch (err) {
    console.error('[chat/start] push falhou:', err);
  }

  return NextResponse.json({ sessionId: session.id });
}
