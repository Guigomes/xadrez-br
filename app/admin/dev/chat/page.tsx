'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/use-auth';
import { useAllChatSessions, useChatSessionMessages, useReplyToChatSession } from '@/lib/hooks/use-chat-admin';
import { PageSpinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { NotifyButton } from '@/components/tournament/notify-button';
import type { ChatSessionStatus } from '@/types/database';

const STATUS_LABEL: Record<ChatSessionStatus, string> = {
  aguardando_humano: 'Aguardando você',
  humano: 'Você está respondendo',
  bot: 'Só o bot',
  encerrada: 'Encerrada',
};

const STATUS_CLASS: Record<ChatSessionStatus, string> = {
  aguardando_humano: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  humano: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
  bot: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  encerrada: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

export default function AdminChatHistoryPage() {
  const { data: profile, isLoading: loadingProfile } = useProfile();

  if (loadingProfile) return <PageSpinner />;
  if (profile?.role !== 'admin') {
    return (
      <EmptyState icon="🔒" title="Acesso restrito"
        description="Este painel é exclusivo para administradores do sistema." />
    );
  }
  return (
    <Suspense fallback={<PageSpinner />}>
      <ChatHistoryPanel />
    </Suspense>
  );
}

function ChatHistoryPanel() {
  const searchParams = useSearchParams();
  const { data: sessions, isLoading } = useAllChatSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  // Deep-link da notificação push (?session=<id>) — só aplica na primeira
  // carga, pra não brigar com o clique manual do admin na lista depois.
  useEffect(() => {
    const fromUrl = searchParams.get('session');
    if (fromUrl) setSessionId(fromUrl);
  }, [searchParams]);

  const selected = sessions?.find((s) => s.id === sessionId);
  const isEscalated = selected?.status === 'aguardando_humano' || selected?.status === 'humano';
  const { data: messages, isLoading: loadingMessages } = useChatSessionMessages(sessionId, isEscalated);
  const sendReply = useReplyToChatSession();

  const sorted = [...(sessions ?? [])].sort((a, b) => {
    if (a.status === 'aguardando_humano' && b.status !== 'aguardando_humano') return -1;
    if (b.status === 'aguardando_humano' && a.status !== 'aguardando_humano') return 1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });

  function handleReply() {
    const message = reply.trim();
    if (!message || !sessionId || sendReply.isPending) return;
    setReply('');
    sendReply.mutate({ sessionId, message });
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">🗨 Histórico do Gambito</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Todas as conversas de todos os usuários com o chatbot de suporte. Visível só para admin.
          </p>
        </div>
        <NotifyButton
          activeLabel="Notificações de atendimento ativas"
          idleLabel="Ativar notificações de atendimento"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,320px)_1fr] gap-4">
        <div className="card p-0 overflow-hidden">
          {isLoading ? (
            <PageSpinner />
          ) : !sorted.length ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Nenhuma conversa ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[70vh] overflow-y-auto">
              {sorted.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSessionId(s.id)}
                    className={`block w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                      s.id === sessionId ? 'bg-gray-50 dark:bg-gray-800/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{s.user_full_name}</p>
                      {s.status !== 'bot' && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.user_email}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(s.last_message_at).toLocaleString('pt-BR')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4 min-h-[300px] flex flex-col">
          {!sessionId ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Selecione uma conversa à esquerda.</p>
          ) : loadingMessages ? (
            <PageSpinner />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selected?.user_full_name} · {selected?.user_email}
                  {selected?.contact_phone && ` · 📞 ${selected.contact_phone}`}
                </p>
                {selected && selected.status !== 'bot' && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[selected.status]}`}>
                    {STATUS_LABEL[selected.status]}
                  </span>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto mb-3">
                {messages?.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-brand-600 text-white'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.sources && m.sources.length > 0 && (
                        <p className="mt-1.5 text-xs opacity-70">
                          Fonte: {m.sources.map((s) => s.doc_title).join(', ')}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] opacity-60">
                        {m.is_human && 'você · '}
                        {new Date(m.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {isEscalated && (
                <div className="flex items-end gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); }
                    }}
                    rows={1}
                    placeholder="Responder como Gambito…"
                    className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                  />
                  <Button size="sm" onClick={handleReply} loading={sendReply.isPending} disabled={!reply.trim()}>
                    Enviar
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
