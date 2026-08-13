import type { SupabaseClient } from '@supabase/supabase-js';
import { CHAT_ALLOW_ANONYMOUS } from './config';

/**
 * Quem pode agir sobre uma sessão de chat, e sobre QUAL sessão.
 *
 * Com o chat anônimo ligado (CHAT_ALLOW_ANONYMOUS), as rotas do chat deixam
 * de exigir login — mas o escopo continua fechado: logado só alcança as
 * próprias sessões (`user_id = <id>`), anônimo só alcança sessão sem dono
 * (`user_id is null`). Sem esse segundo filtro, um visitante que adivinhasse
 * o UUID de uma sessão de usuário logado poderia encerrá-la ou escalá-la.
 *
 * Centralizado aqui porque o mesmo par (gate + escopo) se repete em
 * message/escalate/contact/close-inactive, e cada cópia solta é uma chance
 * de esquecer o `.is('user_id', null)`.
 */

export type ChatRequester =
  | { ok: true; userId: string | null }
  | { ok: false };

export async function resolveChatRequester(supabase: SupabaseClient): Promise<ChatRequester> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !CHAT_ALLOW_ANONYMOUS) return { ok: false };
  return { ok: true, userId: user?.id ?? null };
}

/**
 * Busca a sessão SÓ se ela pertencer a quem está pedindo. `columns` segue a
 * sintaxe do PostgREST (ex.: 'id, status'). Devolve null quando não existe ou
 * é de outra pessoa — quem chama responde 404 nos dois casos, de propósito
 * (não confirma a existência de sessão alheia).
 */
export async function findOwnChatSession<T = any>(
  admin: SupabaseClient,
  sessionId: string,
  userId: string | null,
  columns: string,
): Promise<T | null> {
  let query = admin.from('chat_sessions').select(columns).eq('id', sessionId);
  query = userId ? query.eq('user_id', userId) : query.is('user_id', null);
  const { data } = await query.maybeSingle();
  return (data as T) ?? null;
}
