import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { embedQuery } from '@/lib/chat/embeddings';
import { buildSystemPrompt, extractSources, type RetrievedChunk } from '@/lib/chat/prompt';
import { generateAnswer } from '@/lib/chat/llm';
import { logError } from '@/lib/log-error';
import { sendFcmToAdmins, sendOperatorNotification } from '@/lib/push';

export const runtime = 'nodejs';

// Endurecimento completo (rate limit por sessão/IP, teto diário) é Fase 4 —
// fora de escopo aqui. Limite de tamanho de mensagem é grátis de fazer já,
// então entra mesmo sem o resto.
const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_LIMIT = 10;

/**
 * Pipeline: embeda a pergunta → busca chunks relevantes (match_kb_chunks) →
 * monta prompt → chama Haiku → grava as duas mensagens → devolve resposta.
 *
 * Chat é só pra usuário logado (decisão do usuário — reduz superfície de
 * abuso do endpoint de LLM) — por isso o 401 aqui em vez de aceitar
 * session_token de anônimo, diferente da proposta original do plano.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message: unknown = body?.message;
  const sessionId: unknown = body?.sessionId;
  const tournamentId: unknown = body?.tournamentId;

  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres).` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Reaproveita a sessão se o id veio e é do usuário logado; senão cria uma nova.
  let session: { id: string; status: string } | null = null;
  if (typeof sessionId === 'string' && sessionId) {
    const { data } = await admin
      .from('chat_sessions').select('id, status').eq('id', sessionId).eq('user_id', user.id).maybeSingle();
    session = data;
  }
  if (!session) {
    const { data, error } = await admin
      .from('chat_sessions')
      .insert({ user_id: user.id, tournament_id: typeof tournamentId === 'string' ? tournamentId : null })
      .select('id, status').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    session = data;
  }

  // Histórico recente da sessão, ANTES de gravar a mensagem nova (senão ela
  // entraria duplicada — uma vez no histórico, outra como turno atual).
  const { data: historyRows } = await admin
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyRows ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .reverse();

  // Grava a pergunta já de cara — se o resto falhar depois, ela não se perde.
  const { error: userMsgError } = await admin
    .from('chat_messages').insert({ session_id: session.id, role: 'user', content: message });
  if (userMsgError) return NextResponse.json({ error: userMsgError.message }, { status: 500 });

  // Sessão encerrada (manual ou por inatividade, ver close/route.ts e
  // close-inactive/route.ts) reabre sozinha quando o usuário manda mensagem
  // nova — pedido do usuário: só recomeça se enviar mensagem, não precisa de
  // ação separada de "reabrir".
  const sessionUpdate: Record<string, string> = { last_message_at: new Date().toISOString() };
  if (session.status === 'encerrada') sessionUpdate.status = 'bot';
  await admin.from('chat_sessions').update(sessionUpdate).eq('id', session.id);

  // Escalada pra humano (app/api/chat/escalate/route.ts) — o bot para de
  // responder, a mensagem só fica esperando o admin ver em /admin/dev/chat.
  // Aviso já saiu no momento da escalada (escalate/route.ts); aqui é
  // mensagem de acompanhamento na mesma sessão — sem isso o admin só vê a
  // mensagem nova quando abrir o app de novo.
  if (session.status === 'aguardando_humano' || session.status === 'humano') {
    const { data: profile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const userName = profile?.full_name || 'Alguém';
    try {
      await sendOperatorNotification({
        title: userName,
        body: message,
        url: `/admin/dev/chat?session=${session.id}`,
      });
    } catch (err) {
      console.error('[chat/message] web push falhou:', err);
    }
    try {
      await sendFcmToAdmins({ type: 'message', sessionId: session.id, userName, content: message });
    } catch (err) {
      console.error('[chat/message] fcm falhou:', err);
    }
    return NextResponse.json({ sessionId: session.id, answer: null, waitingForHuman: true, sources: [] });
  }

  try {
    const queryEmbedding = await embedQuery(message);
    const { data: matches, error: matchError } = await admin.rpc('match_kb_chunks', {
      query_embedding: queryEmbedding as any, match_count: 5, min_similarity: 0.3,
    });
    if (matchError) throw matchError;

    const chunks: RetrievedChunk[] = (matches ?? []).map((m) => ({
      docSlug: m.doc_slug, docTitle: m.doc_title, content: m.content, similarity: m.similarity,
    }));

    const systemPrompt = buildSystemPrompt(chunks);
    const sources = extractSources(chunks);

    const answer = await generateAnswer(
      systemPrompt,
      history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      message,
      // Client autenticado do próprio usuário (RLS) pras contagens — "meus
      // torneios" só pode contar o que esse user_id realmente pode ver.
      // admin só é usado por registrar_pergunta_sem_resposta (tabela sem
      // policy de insert pro client comum, de propósito).
      { supabase, admin, userId: user.id, sessionId: session.id, originalQuestion: message },
    );

    const { error: assistantMsgError } = await admin
      .from('chat_messages').insert({ session_id: session.id, role: 'assistant', content: answer, sources });
    if (assistantMsgError) throw assistantMsgError;

    return NextResponse.json({ sessionId: session.id, answer, sources });
  } catch (err: any) {
    console.error('[chat] erro ao gerar resposta:', err);
    await logError({
      source: 'api', message: err?.message ?? String(err), stack: err?.stack ?? null,
      route: '/api/chat/message', method: 'POST', statusCode: 500, userId: user.id,
    });
    return NextResponse.json({ error: 'Erro ao gerar resposta. Tente de novo.' }, { status: 500 });
  }
}
