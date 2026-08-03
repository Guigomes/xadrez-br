import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Pedido do usuário: 5 minutos sem NENHUMA interação (bot ou humano) encerra
// a conversa sozinha — diferente do timeout de 3 minutos em
// app/api/chat/contact/route.ts, que só conta a partir de quando o usuário
// pediu atendente. O timer em si é só do cliente (chat-widget.tsx compara
// contra o timestamp da última mensagem vista, sem job agendado, mesmo
// padrão do timeout de 3 min); esta rota só executa a ação quando o widget
// decide que passou do tempo.
const CLOSE_MESSAGE =
  'Faz um tempo que não conversamos, então encerrei por aqui. Seu problema foi resolvido? ' +
  'Se quiser, deixa seu celular que a gente entra em contato — ou é só mandar outra mensagem que eu volto a te ajudar.';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sessionId: unknown = body?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'sessionId obrigatório.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from('chat_sessions').select('id, status').eq('id', sessionId).eq('user_id', user.id).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });

  // Idempotente — se dois ticks do timer do cliente chegarem quase juntos
  // (ou o usuário já encerrou por outro caminho), não duplica a mensagem.
  if (session.status === 'encerrada') return NextResponse.json({ ok: true });

  const { error: msgError } = await admin
    .from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: CLOSE_MESSAGE });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  const { error: updateError } = await admin
    .from('chat_sessions').update({ status: 'encerrada', last_message_at: new Date().toISOString() }).eq('id', sessionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
