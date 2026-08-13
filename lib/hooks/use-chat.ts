'use client';

import { useRef as useReactRef } from 'react';
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

/**
 * Ao abrir o widget, verifica se a sessão armazenada está expirada (última
 * mensagem há mais de 15 min). Se sim, encerra a sessão via
 * /api/chat/close-inactive e limpa o sessionId do localStorage — próxima
 * mensagem do usuário criará uma nova sessão.
 *
 * Não encerra se a sessão estiver em atendimento humano
 * (status='humano' ou 'aguardando_humano').
 *
 * Retorna a função `checkAndExpire(sessionId)` que deve ser chamada quando
 * o widget é aberto. A função é assíncrona e não lança — erros de rede são
 * silenciados para não bloquear a abertura do widget.
 */
export function useExpiredSessionCheck(options: {
  onExpired: () => void;
}) {
  const checkingRef = useReactRef(false);

  async function checkAndExpire(sessionId: string): Promise<void> {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const supabase = createClient();
      const { data: session } = await supabase
        .from('chat_sessions')
        .select('status, last_message_at')
        .eq('id', sessionId)
        .maybeSingle();

      if (!session) {
        // Sessão não existe no banco — limpar localStorage igualmente.
        options.onExpired();
        return;
      }

      // Conversas em atendimento humano nunca são encerradas automaticamente.
      if (session.status === 'humano' || session.status === 'aguardando_humano') return;
      // Sessão já encerrada → limpar só o localStorage.
      if (session.status === 'encerrada') { options.onExpired(); return; }

      const lastAt = session.last_message_at ? new Date(session.last_message_at).getTime() : null;
      if (lastAt === null) return; // sem mensagem ainda, não expirar.

      const EXPIRY_MS = 15 * 60 * 1000;
      if (Date.now() - lastAt < EXPIRY_MS) return; // dentro do prazo.

      // Encerrar via endpoint existente (idempotente).
      await fetch('/api/chat/close-inactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      options.onExpired();
    } catch {
      // Não bloquear abertura do widget em caso de falha.
    } finally {
      checkingRef.current = false;
    }
  }

  return { checkAndExpire };
}

/** 5 min sem interação (ver INACTIVITY_TIMEOUT_MS em chat-widget.tsx) — encerra a sessão sozinha. */
export function useCloseInactiveChat() {
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch('/api/chat/close-inactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao encerrar sessão.');
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

/**
 * Todas as sessões de chat do usuário logado, ordenadas da mais recente
 * para a mais antiga. Limitado a 50 para não sobrecarregar. Usado pelo
 * painel de histórico do widget.
 */
export function useChatHistory() {
  return useQuery({
    queryKey: ['chat-history'],
    queryFn: async (): Promise<ChatSession[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ message, sessionId, tournamentId, tournamentSlug }: {
      message: string; sessionId: string | null; tournamentId?: string | null; tournamentSlug?: string | null;
    }): Promise<SendChatMessageResult> => {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, tournamentId, tournamentSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar mensagem.');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', data.sessionId] });
      // Também reinvalida o STATUS da sessão: mandar mensagem numa sessão
      // 'encerrada' a reabre pra 'bot' no servidor (message/route.ts), mas
      // useChatSession não é polled — sem isto o client fica com o status
      // velho e o botão "Falar com atendente" (que exige status==='bot')
      // continua escondido depois da reabertura.
      queryClient.invalidateQueries({ queryKey: ['chat-session', data.sessionId] });
    },
  });
}
