'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useUser } from '@/lib/hooks/use-auth';
import {
  useChatMessages, useSendChatMessage, useChatSession, useEscalateChat, useSubmitContactPhone,
  useCloseInactiveChat,
} from '@/lib/hooks/use-chat';
import { useQueryClient } from '@tanstack/react-query';
import { ChatBubble } from './chat-bubble';
import { ChatHistory } from './chat-history';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Se ninguém no admin responder nesse tempo depois da escalada, o widget
// pede telefone pra contato (decisão do usuário — ver docs/plano-chatbot-
// suporte.md §7, que já previa esse timeout, só que com e-mail no lugar).
// Comparação de timestamp no cliente, sem job agendado (mesma ideia do plano).
const ESCALATION_TIMEOUT_MS = 3 * 60 * 1000;

// Pedido do usuário: 5 min sem NENHUMA interação (bot ou humano) encerra a
// conversa sozinha — independe de ter escalado ou não, diferente do timeout
// acima. Contado a partir da última mensagem que o widget efetivamente viu
// (lastActivityRef), não de um campo do banco — evita precisar ficar
// repollando a sessão inteira só pra isso (ver app/api/chat/close-inactive/route.ts).
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

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

/**
 * Avatar de atendente humano — pedido do usuário: reverte a decisão antiga
 * de nunca revelar que quem respondeu foi um humano (ver docs/pendencias-
 * chatbot.md, "Fase 3"). Usado quando a mensagem tem is_human=true, ou no
 * cabeçalho enquanto status='humano'.
 */
function HumanAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm dark:bg-brand-900">
      🎧
    </span>
  );
}

// Pedido do usuário: ao abrir o widget, se a última mensagem foi há mais
// de 15 minutos, encerrar a conversa antiga e iniciar uma nova. Não se
// aplica a sessões em atendimento humano (status='humano' ou 'aguardando_humano').
const OPEN_EXPIRY_MS = 15 * 60 * 1000;

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
  const [showHistory, setShowHistory] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  // useChatMessages fica "enabled: false" até a sessão ganhar id (1ª mensagem
  // da conversa) — sem isso, a bolha do usuário só apareceria depois da
  // resposta do Gambito chegar, junto com ela.
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  // Texto do formulário muda conforme o motivo — 'inactivity' (5 min gerais,
  // já apareceu junto da mensagem de encerramento) não pode repetir "ainda
  // não consegui te atender ao vivo", que só faz sentido no caso de escalada.
  const [phoneFormReason, setPhoneFormReason] = useState<'escalation' | 'inactivity'>('escalation');
  const [phoneSubmitted, setPhoneSubmitted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const closingRef = useRef(false);

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
  const closeInactive = useCloseInactiveChat();
  const queryClient = useQueryClient();

  // Ao abrir o widget: se há sessão e a última mensagem foi há mais de
  // OPEN_EXPIRY_MS, encerrar silenciosamente e limpar o localStorage pra
  // a próxima mensagem criar uma nova conversa. Nunca encerra se o status
  // indica atendimento humano em curso.
  useEffect(() => {
    if (!open || !sessionId || !sessionQuery.data) return;
    const { status: s, last_message_at } = sessionQuery.data;
    if (s === 'humano' || s === 'aguardando_humano' || s === 'encerrada') return;
    if (!last_message_at) return;
    const elapsed = Date.now() - new Date(last_message_at).getTime();
    if (elapsed <= OPEN_EXPIRY_MS) return;
    // Encerrar assincronamente — sem bloquear abertura do widget.
    closeInactive.mutate(sessionId, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: ['chat-session', sessionId] });
        setSessionId(null);
        writeStoredSessionId('');
      },
    });
  // Só deve disparar quando `open` muda pra true (na abertura), não a cada
  // re-render — sessionQuery.data é lido na hora, não como dependência de
  // disparo, para evitar encerrar em re-renders posteriores com dados novos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pendingUserMessage, sendMessage.isPending, showPhoneForm]);

  // 3 min sem resposta do admin depois da escalada → pede telefone. Checa a
  // cada segundo em vez de um timeout único, pra funcionar mesmo se o
  // usuário abrir o widget bem depois de já ter escalado (reload da página).
  useEffect(() => {
    if (status !== 'aguardando_humano' || !sessionQuery.data?.escalated_at || phoneSubmitted) return;
    const escalatedAt = new Date(sessionQuery.data.escalated_at).getTime();
    const check = () => {
      if (Date.now() - escalatedAt >= ESCALATION_TIMEOUT_MS) {
        setPhoneFormReason('escalation');
        setShowPhoneForm(true);
      }
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [status, sessionQuery.data?.escalated_at, phoneSubmitted]);

  // Qualquer mensagem nova (do usuário ou vinda do poll, bot/humano) conta
  // como interação e reinicia a contagem dos 5 min.
  useEffect(() => {
    if (messages && messages.length > 0) lastActivityRef.current = Date.now();
  }, [messages?.length]);

  // 5 min sem NENHUMA mensagem → encerra a sessão sozinha (INACTIVITY_TIMEOUT_MS).
  useEffect(() => {
    if (!sessionId || status === 'encerrada') { closingRef.current = false; return; }
    const interval = setInterval(() => {
      if (closingRef.current) return;
      if (Date.now() - lastActivityRef.current < INACTIVITY_TIMEOUT_MS) return;
      closingRef.current = true;
      closeInactive.mutate(sessionId, {
        onSuccess: () => {
          sessionQuery.refetch();
          if (!phoneSubmitted) {
            setPhoneFormReason('inactivity');
            setShowPhoneForm(true);
          }
        },
        onSettled: () => { closingRef.current = false; },
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionId, status, phoneSubmitted]);

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
    lastActivityRef.current = Date.now();
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
            {status === 'humano' ? <HumanAvatar /> : <GambitoAvatar />}
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {status === 'humano' ? 'Atendente' : 'Gambito'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">Suporte</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-medium text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
              title="Histórico de conversas"
            >
              Histórico
            </button>
          </div>

          <div ref={listRef} className={`flex-1 space-y-3 overflow-y-auto px-4 py-3 ${showHistory ? 'hidden' : ''}`}>
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
                {m.role !== 'user' && (m.is_human ? <HumanAvatar /> : <GambitoAvatar />)}
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
                  <p>
                    {phoneFormReason === 'escalation'
                      ? 'Ainda não consegui te atender ao vivo. Deixa seu celular que a gente entra em contato:'
                      : 'Deixa seu celular, se quiser, que a gente entra em contato:'}
                  </p>
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

          {showHistory && (
            <ChatHistory
              currentSessionId={sessionId}
              onSelectSession={(id) => {
                setSessionId(id);
                writeStoredSessionId(id);
                setShowHistory(false);
              }}
              onClose={() => setShowHistory(false)}
            />
          )}

          {!showHistory && status === 'bot' && sessionId && (
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

          {!showHistory && (
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
          )}
        </div>
      )}
    </>
  );
}
