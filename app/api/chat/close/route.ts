import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Botão "Encerrar conversa" do atendente, em /admin/dev/chat — pedido do
// usuário: fecha a sessão mas mantém o histórico visível (o widget só
// mostra um aviso a mais, não apaga nada). is_human=true de propósito aqui,
// diferente de close-inactive/route.ts: essa mensagem é decisão do
// atendente, não do sistema — mostra avatar de humano no widget (ver
// chat-widget.tsx, HumanAvatar).
const CLOSE_MESSAGE = 'Atendimento encerrado por aqui. Se precisar de mais alguma coisa, é só mandar outra mensagem.';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const sessionId: unknown = body?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'sessionId obrigatório.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin.from('chat_sessions').select('id, status').eq('id', sessionId).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });
  if (session.status === 'encerrada') return NextResponse.json({ ok: true });

  const { error: msgError } = await admin
    .from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: CLOSE_MESSAGE, is_human: true });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  const { error: updateError } = await admin
    .from('chat_sessions').update({ status: 'encerrada', last_message_at: new Date().toISOString() }).eq('id', sessionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
