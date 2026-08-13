import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveChatRequester, findOwnChatSession } from '@/lib/chat/session-access';

export const runtime = 'nodejs';

/**
 * Widget chama isso quando passam 3 minutos sem resposta humana depois da
 * escalada (ver ESCALATION_TIMEOUT_MS em chat-widget.tsx — o timer é só do
 * cliente, comparando com escalated_at, sem job agendado). Guarda o telefone
 * na sessão e registra como mensagem do usuário, pra ficar visível no
 * histórico (/admin/dev/chat) quando o admin finalmente ver a conversa.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const requester = await resolveChatRequester(supabase);
  if (!requester.ok) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sessionId: unknown = body?.sessionId;
  const phone: unknown = body?.phone;
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'sessionId obrigatório.' }, { status: 400 });
  }
  if (typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'Telefone obrigatório.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const session = await findOwnChatSession(admin, sessionId, requester.userId, 'id');
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });

  const { error: updateError } = await admin
    .from('chat_sessions').update({ contact_phone: phone.trim() }).eq('id', sessionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: msgError } = await admin
    .from('chat_messages').insert({ session_id: sessionId, role: 'user', content: `📞 Telefone para contato: ${phone.trim()}` });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
