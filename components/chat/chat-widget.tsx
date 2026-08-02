'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useUser } from '@/lib/hooks/use-auth';
import {
  useChatMessages, useSendChatMessage, useChatSession, useEscalateChat, useSubmitContactPhone,
} from '@/lib/hooks/use-chat';
import { ChatBubble } from './chat-bubble';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Se ninguém no admin responder nesse tempo depois da escalada, o widget
// pede telefone pra contato (decisão do usuário — ver docs/plano-chatbot-
// suporte.md §7, que já previa esse timeout, só que com e-mail no lugar).
// Comparação de timestamp no cliente, sem job agendado (mesma ideia do plano).
const ESCALATION_TIMEOUT_MS = 3 * 60 * 1000;

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
  // useChatMessages fica "enabled: false" até a sessão ganhar id (1ª mensagem
  // da conversa) — sem isso, a bolha do usuário só apareceria depois da
  // resposta do Gambito chegar, junto com ela.
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [phoneSubmitted, setPhoneSubmitted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Lido só depois de montar (localStorage não existe no server render).
  useEffect(() => {
    setSessionId(readStoredSessionId());
  }, []);

  const sessionQuery = useChatSession(sessionId);
  const status = sessionQuery.data?.status ?? 'bot';
  const isEscalated = status === 'aguardando_humano' || status === 'humano';

  const { data: messages, isLoading } = useChatMessages(sessionId, isEscalated);
  const sendMessage = useSendChatMessage();
  const escalate = useEscalateChat();
  const submitPhone = useSubmitContactPhone();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pendingUserMessage, sendMessage.isPending, showPhoneForm]);

  // 3 min sem resposta do admin depois da escalada → pede telefone. Checa a
  // cada segundo em vez de um timeout único, pra funcionar mesmo se o
  // usuário abrir o widget bem depois de já ter escalado (reload da página).
  useEffect(() => {
    if (status !== 'aguardando_humano' || !sessionQuery.data?.escalated_at || phoneSubmitted) return;
    const escalatedAt = new Date(sessionQuery.data.escalated_at).getTime();
    const check = () => setShowPhoneForm(Date.now() - escalatedAt >= ESCALATION_TIMEOUT_MS);
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [status, sessionQuery.data?.escalated_at, phoneSubmitted]);

  if (!user) return null;

  function handleEscalate() {
    if (!sessionId || escalate.isPending) return;
    escalate.mutate(sessionId, { onSuccess: () => sessionQuery.refetch() });
  }

  function handleSubmitPhone() {
    const value = phone.trim();
    if (!value || !sessionId || submitPhone.isPending) return;
    submitPhone.mutate({ sessionId, phone: value }, {
      onSuccess: () => { setPhoneSubmitted(true); setShowPhoneForm(false); },
    });
  }

  function handleSend() {
    const message = input.trim();
    if (!message || sendMessage.isPending) return;
    setInput('');
    setPendingUserMessage(message);
    sendMessage.mutate({ message, sessionId }, {
      onSuccess: (data) => {
        if (data.sessionId !== sessionId) {
          setSessionId(data.sessionId);
          writeStoredSessionId(data.sessionId);
        }
        setPendingUserMessage(null);
      },
      onError: () => setPendingUserMessage(null),
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
                </div>
              </div>
            ))}
            {pendingUserMessage && (
              <div className="flex justify-end gap-2">
                <div className="max-w-[85%] rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">
                  <p className="whitespace-pre-wrap">{pendingUserMessage}</p>
                </div>
              </div>
            )}
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
            {showPhoneForm && !phoneSubmitted && (
              <div className="flex gap-2">
                <GambitoAvatar />
                <div className="max-w-[85%] space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <p>Ainda não consegui te atender ao vivo. Deixa seu celular que a gente entra em contato:</p>
                  <div className="flex gap-2">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 91234-5678"
                      className="h-8 text-xs"
                    />
                    <Button size="sm" onClick={handleSubmitPhone} loading={submitPhone.isPending} disabled={!phone.trim()}>
                      Enviar
                    </Button>
                  </div>
                  {submitPhone.isError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{(submitPhone.error as Error).message}</p>
                  )}
                </div>
              </div>
            )}
            {phoneSubmitted && (
              <div className="flex gap-2">
                <GambitoAvatar />
                <p className="max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  Anotado! Vamos entrar em contato assim que possível.
                </p>
              </div>
            )}
          </div>

          {status === 'bot' && sessionId && (
            <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-800">
              <button
                type="button"
                onClick={handleEscalate}
                disabled={escalate.isPending}
                className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400"
              >
                {escalate.isPending ? 'Chamando…' : 'Falar com atendente'}
              </button>
            </div>
          )}

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
