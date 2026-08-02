'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ChatMessage, ChatSession } from '@/types/database';

const supabase = createClient();

export interface ChatSessionWithUser extends ChatSession {
  user_full_name: string;
  user_email: string | null;
}

/**
 * Todas as sessões, de todos os usuários — só role='admin' enxerga
 * (chat_sessions_select_admin, migration 050). chat_sessions.user_id
 * referencia auth.users, não user_profiles, então o PostgREST não embeda
 * o join automático; busca os perfis à parte e junta no client.
 */
export function useAllChatSessions() {
  return useQuery({
    queryKey: ['admin-chat-sessions'],
    // Sem Realtime nesse projeto (ver migration 051) — polling é o jeito de
    // "aguardando_humano" aparecer no topo da lista sem precisar recarregar.
    refetchInterval: 5000,
    queryFn: async (): Promise<ChatSessionWithUser[]> => {
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!sessions?.length) return [];

      const userIds = [...new Set(sessions.map((s) => s.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (profilesError) throw profilesError;

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
      return sessions.map((s) => ({
        ...s,
        user_full_name: profileById.get(s.user_id)?.full_name || '(sem nome)',
        user_email: profileById.get(s.user_id)?.email ?? null,
      }));
    },
  });
}

export function useChatSessionMessages(sessionId: string | null, poll = false) {
  return useQuery({
    queryKey: ['admin-chat-messages', sessionId],
    enabled: !!sessionId,
    refetchInterval: poll ? 3000 : false,
    queryFn: async (): Promise<ChatMessage[]> => {
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

export function useReplyToChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const res = await fetch('/api/chat/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar resposta.');
      return data;
    },
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-messages', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
    },
  });
}
