import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Admin responde uma sessão escalada, de /admin/dev/chat — gate: role='admin'.
 * Gravada com role='assistant' (aparece como Gambito pro usuário, decisão
 * do usuário) e is_human=true (só pra distinguir no seu próprio histórico).
 * Marca status='humano' — bot já não respondia desde a escalada
 * ('aguardando_humano'), isso só deixa explícito que já teve resposta.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const sessionId: unknown = body?.sessionId;
  const message: unknown = body?.message;
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'sessionId obrigatório.' }, { status: 400 });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres).` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin.from('chat_sessions').select('id').eq('id', sessionId).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });

  const { error: msgError } = await admin
    .from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: message, is_human: true });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  const { error: updateError } = await admin
    .from('chat_sessions').update({ status: 'humano', last_message_at: new Date().toISOString() }).eq('id', sessionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
