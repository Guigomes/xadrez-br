'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useChatMessages, useChatSession, useMarkChatRead, useSendChatMessage } from '@/lib/hooks/use-chat';

function time(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Conversa na caixa de mensagens. Responder usa a mesma rota do widget (/api/chat/message):
 * em conversa com a equipe (status 'humano'/'aguardando_humano') a mensagem vai para o admin;
 * nas outras, o bot responde. Sem Realtime: busca novas mensagens a cada poucos segundos.
 */
export function ConversationView({ sessionId, fromTeam }: { sessionId: string; fromTeam: boolean }) {
  const { data: session } = useChatSession(sessionId, true);
  const { data: messages, isLoading } = useChatMessages(sessionId, true);
  const send = useSendChatMessage();
  const markRead = useMarkChatRead();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Lida ao abrir e sempre que chega mensagem nova.
  const count = messages?.length ?? 0;
  useEffect(() => {
    if (count) markRead.mutate(sessionId);
    bottom.current?.scrollIntoView({ block: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- marca de novo só quando muda a contagem
  }, [count, sessionId]);

  const withTeam = session?.status === 'humano' || session?.status === 'aguardando_humano';

  function submit() {
    const message = text.trim();
    if (!message || send.isPending) return;
    setError(null);
    setText('');
    send.mutate({ message, sessionId }, { onError: (e) => { setError(e.message); setText(message); } });
  }

  return (
    <div className="card flex min-h-[60vh] flex-col p-0">
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <Link href="/minha-area/mensagens" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">← Mensagens</Link>
        <span className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">♞</span>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gambito</p>
          <p className="text-[11px] text-gray-400">{withTeam || fromTeam ? 'Atendimento da equipe' : 'Assistente do site'}</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner className="h-6 w-6" /></div>
        ) : (
          messages?.filter((m) => m.role !== 'system').map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.role === 'user'
                    ? 'rounded-br-md bg-brand-600 text-white'
                    : 'rounded-bl-md bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-white/70' : 'text-gray-400'}`}>{time(m.created_at)}</p>
              </div>
            </div>
          ))
        )}
        {send.isPending && !withTeam && (
          <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-gray-100 px-3.5 py-2 text-sm text-gray-500 dark:bg-gray-800">Gambito está digitando…</div></div>
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t border-gray-100 p-3 dark:border-gray-800">
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            maxLength={2000}
            placeholder="Escreva uma mensagem…"
            className="min-h-11 flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
          <Button onClick={submit} loading={send.isPending} disabled={!text.trim()}>Enviar</Button>
        </div>
      </div>
    </div>
  );
}
