import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { resolveChatRequester, findOwnChatSession } from '@/lib/chat/session-access';
import { sendFcmToAdmins, sendOperatorNotification } from '@/lib/push';

export const runtime = 'nodejs';

/**
 * Usuário clica "Falar com atendente" — marca a sessão como aguardando
 * humano e notifica o(s) admin(s) (push, ver lib/push.ts). O bot para de
 * responder a partir daqui (app/api/chat/message/route.ts checa o status).
 *
 * A mensagem de confirmação é gravada como role='assistant' (não um aviso
 * de sistema à parte) — decisão do usuário: o Gambito nunca "some" da
 * conversa, mesmo quando quem responde depois é um humano.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const requester = await resolveChatRequester(supabase);
  if (!requester.ok) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { userId } = requester;

  const body = await request.json().catch(() => null);
  const sessionId: unknown = body?.sessionId;
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'sessionId obrigatório.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const session = await findOwnChatSession<{ id: string; status: string; escalated_at: string | null }>(
    admin, sessionId, userId, 'id, status, escalated_at',
  );
  if (!session) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 });

  // Idempotente — clique duplo (ou reload) não reenvia notificação nem
  // reseta o timer de 3 minutos que o widget calcula a partir de escalated_at.
  if (session.status !== 'bot') {
    return NextResponse.json({ ok: true, escalatedAt: session.escalated_at });
  }

  const escalatedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from('chat_sessions')
    .update({ status: 'aguardando_humano', escalated_at: escalatedAt, last_message_at: escalatedAt })
    .eq('id', sessionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const ackMessage = 'Já chamei alguém pra te ajudar, só um instante!';
  const { error: msgError } = await admin
    .from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: ackMessage });
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  // Visitante sem login não tem perfil pra consultar — o admin precisa saber
  // disso na notificação, porque não vai ter e-mail nem conta pra procurar
  // (o telefone que o widget pede depois de 3 min é o único retorno possível).
  const { data: profile } = userId
    ? await supabase.from('user_profiles').select('full_name').eq('id', userId).maybeSingle()
    : { data: null };
  const userName = profile?.full_name || (userId ? 'Alguém' : 'Visitante (sem login)');

  // Falha de push (ex.: VAPID/Firebase não configurado neste ambiente) não
  // pode derrubar a escalada em si — o admin ainda vê no painel, só sem o
  // aviso imediato. Web push (navegador) e FCM (app Android) são canais
  // independentes, dispara os dois.
  try {
    await sendOperatorNotification({
      title: 'Gambito: atendimento solicitado',
      body: `${userName} pediu para falar com um atendente.`,
      url: `/admin/dev/chat?session=${sessionId}`,
    });
  } catch (err) {
    console.error('[chat/escalate] web push falhou:', err);
  }
  try {
    await sendFcmToAdmins({ type: 'escalation', sessionId, userName });
  } catch (err) {
    console.error('[chat/escalate] fcm falhou:', err);
  }

  return NextResponse.json({ ok: true, escalatedAt });
}
