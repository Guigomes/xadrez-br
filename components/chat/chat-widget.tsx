'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useUser } from '@/lib/hooks/use-auth';
import { useChatMessages, useSendChatMessage } from '@/lib/hooks/use-chat';
import { ChatBubble } from './chat-bubble';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

/** Avatar do Gambito ao lado de cada resposta — reforça que é ele "falando", mesma ideia do tour guiado. */
function GambitoAvatar() {
  return (
    <Image
      src="/mascot/gambito-acenando.png"
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 shrink-0 rounded-full object-cover object-top"
    />
  );
}

const SESSION_KEY = 'xbr_chat_session_id';

// Mesmo padrão defensivo de lib/tour/state.ts: guarda de `typeof window`
// (o layout raiz é Server Component) e try/catch (storage lança em modo
// privado de alguns navegadores).
function readStoredSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeStoredSessionId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* sessão simplesmente não persiste entre reloads */
  }
}

/**
 * Widget de chat flutuante — só pra usuário logado (decisão do usuário),
 * por isso o self-gate em useUser() em vez de esconder via CSS. Monta
 * incondicionalmente no layout raiz (mesmo padrão de PwaRegister).
 */
export function ChatWidget() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Lido só depois de montar (localStorage não existe no server render).
  useEffect(() => {
    setSessionId(readStoredSessionId());
  }, []);

  const { data: messages, isLoading } = useChatMessages(sessionId);
  const sendMessage = useSendChatMessage();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sendMessage.isPending]);

  if (!user) return null;

  function handleSend() {
    const message = input.trim();
    if (!message || sendMessage.isPending) return;
    setInput('');
    sendMessage.mutate({ message, sessionId }, {
      onSuccess: (data) => {
        if (data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          writeStoredSessionId(data.sessionId);
        }
      },
    });
  }

  return (
    <>
      <ChatBubble open={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div
          className="fixed bottom-20 right-4 z-40 flex w-[calc(100vw-2rem)] max-w-sm flex-col rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
          style={{ height: 'min(32rem, 70vh)' }}
        >
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <GambitoAvatar />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">Gambito</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">Suporte</p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {isLoading && <Spinner className="mx-auto h-5 w-5" />}
            {!isLoading && (!messages || messages.length === 0) && (
              <div className="flex gap-2">
                <GambitoAvatar />
                <p className="max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  Oi! Sou o Gambito 👋 Pergunte sobre como usar o sistema — criar torneio,
                  inscrições, classificação, emparceiramento, rodadas...
                </p>
              </div>
            )}
            {messages?.map((m) => (
              <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role !== 'user' && <GambitoAvatar />}
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
                </div>
              </div>
            ))}
            {sendMessage.isPending && (
              <div className="flex justify-start gap-2">
                <GambitoAvatar />
                <div className="rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-800">
                  <Spinner className="h-4 w-4" />
                </div>
              </div>
            )}
            {sendMessage.isError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {(sendMessage.error as Error).message}
              </p>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-gray-200 p-3 dark:border-gray-800">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Digite sua pergunta…"
              className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
            <Button size="sm" onClick={handleSend} loading={sendMessage.isPending} disabled={!input.trim()}>
              Enviar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
