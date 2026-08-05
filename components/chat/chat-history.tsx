'use client';

import { useState } from 'react';
import { useChatHistory, useChatMessages } from '@/lib/hooks/use-chat';
import { Spinner } from '@/components/ui/spinner';
import type { ChatSession } from '@/types/database';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: ChatSession['status']) {
  switch (status) {
    case 'bot': return 'Ativa';
    case 'aguardando_humano': return 'Aguardando atendente';
    case 'humano': return 'Com atendente';
    case 'encerrada': return 'Encerrada';
  }
}

function statusColor(status: ChatSession['status']) {
  switch (status) {
    case 'bot': return 'text-green-600 dark:text-green-400';
    case 'aguardando_humano': return 'text-amber-600 dark:text-amber-400';
    case 'humano': return 'text-blue-600 dark:text-blue-400';
    case 'encerrada': return 'text-gray-500 dark:text-gray-400';
  }
}

/** Pré-visualização: primeira mensagem do usuário numa sessão. */
function SessionPreview({ sessionId }: { sessionId: string }) {
  const { data: messages, isLoading } = useChatMessages(sessionId, false);
  const first = messages?.find((m) => m.role === 'user');
  if (isLoading) return <Spinner className="h-3 w-3" />;
  if (!first) return <span className="italic text-gray-400">Sem mensagens</span>;
  return <span className="truncate">{first.content}</span>;
}

/** Exibição completa das mensagens de uma conversa anterior (somente leitura). */
function SessionDetail({
  session,
  onBack,
}: {
  session: ChatSession;
  onBack: () => void;
}) {
  const { data: messages, isLoading } = useChatMessages(session.id, false);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          ← Voltar
        </button>
        <span className="ml-1 text-xs text-gray-500">{formatDate(session.created_at)}</span>
        <span className={`ml-auto text-xs font-medium ${statusColor(session.status)}`}>
          {statusLabel(session.status)}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {isLoading && <Spinner className="mx-auto h-5 w-5" />}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {!isLoading && (!messages || messages.length === 0) && (
          <p className="text-center text-xs text-gray-400">Sem mensagens nesta conversa.</p>
        )}
      </div>
    </div>
  );
}

export interface ChatHistoryProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

/**
 * Painel de histórico de conversas. Exibe lista das últimas 50 sessões do
 * usuário; ao clicar numa, mostra as mensagens (somente leitura). Permite
 * retomar a sessão ativa clicando nela ou via botão "Conversa atual".
 */
export function ChatHistory({ currentSessionId, onSelectSession, onClose }: ChatHistoryProps) {
  const { data: sessions, isLoading } = useChatHistory();
  const [selected, setSelected] = useState<ChatSession | null>(null);

  if (selected) {
    return (
      <SessionDetail
        session={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Histórico de conversas
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Fechar
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading && <Spinner className="mx-auto mt-4 h-5 w-5" />}
        {!isLoading && (!sessions || sessions.length === 0) && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma conversa encontrada.</p>
        )}
        {sessions?.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              if (s.status !== 'encerrada' && s.id !== currentSessionId) {
                onSelectSession(s.id);
              } else {
                setSelected(s);
              }
            }}
            className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>{formatDate(s.created_at)}</span>
              <span className={`ml-auto font-medium ${statusColor(s.status)}`}>
                {statusLabel(s.status)}
                {s.id === currentSessionId && ' · atual'}
              </span>
            </div>
            <p className="mt-0.5 flex text-xs text-gray-700 dark:text-gray-300">
              <SessionPreview sessionId={s.id} />
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
