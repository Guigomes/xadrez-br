'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ChatMessage, ChatSession } from '@/types/database';

/**
 * Status da própria sessão — o widget precisa disso pra saber se mostra
 * "Falar com atendente", "Aguardando..." ou o formulário de telefone (ver
 * ESCALATION_TIMEOUT_MS em chat-widget.tsx). poll=true enquanto escalada,
 * mesmo motivo de useChatMessages(poll).
 */
export function useChatSession(sessionId: string | null, poll = false) {
  return useQuery({
    queryKey: ['chat-session', sessionId],
    enabled: !!sessionId,
    refetchInterval: poll ? 3000 : false,
    queryFn: async (): Promise<ChatSession | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Histórico da sessão — leitura direta via client (RLS garante que só o
 * dono vê, chat_messages_select_own). Só a escrita (POST) passa pela API
 * route, que usa createAdminClient (ver app/api/chat/message/route.ts).
 *
 * poll=true liga refetchInterval — usado enquanto a sessão está escalada
 * pra humano (sem Realtime nesse projeto, ver migration 051), pra o widget
 * pegar a resposta do admin sem precisar recarregar a página.
 */
export function useChatMessages(sessionId: string | null, poll = false) {
  return useQuery({
    queryKey: ['chat-messages', sessionId],
    enabled: !!sessionId,
    refetchInterval: poll ? 3000 : false,
    queryFn: async (): Promise<ChatMessage[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEscalateChat() {
  return useMutation({
    mutationFn: async (sessionId: string): Promise<{ ok: boolean; escalatedAt: string | null }> => {
      const res = await fetch('/api/chat/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao chamar atendente.');
      return data;
    },
  });
}

export function useSubmitContactPhone() {
  return useMutation({
    mutationFn: async ({ sessionId, phone }: { sessionId: string; phone: string }) => {
      const res = await fetch('/api/chat/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar telefone.');
      return data;
    },
  });
}

export interface SendChatMessageResult {
  sessionId: string;
  // null quando a sessão já está escalada pra humano — o bot não gera mais
  // resposta, a mensagem só fica esperando o admin ver em /admin/dev/chat.
  answer: string | null;
  waitingForHuman?: boolean;
  sources: { doc_slug: string; doc_title: string }[];
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ message, sessionId, tournamentId }: {
      message: string; sessionId: string | null; tournamentId?: string | null;
    }): Promise<SendChatMessageResult> => {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar mensagem.');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', data.sessionId] });
    },
  });
}
