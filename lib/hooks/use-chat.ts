'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ChatMessage } from '@/types/database';

/**
 * Histórico da sessão — leitura direta via client (RLS garante que só o
 * dono vê, chat_messages_select_own). Só a escrita (POST) passa pela API
 * route, que usa createAdminClient (ver app/api/chat/message/route.ts).
 */
export function useChatMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ['chat-messages', sessionId],
    enabled: !!sessionId,
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

export interface SendChatMessageResult {
  sessionId: string;
  answer: string;
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
