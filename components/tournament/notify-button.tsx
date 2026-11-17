'use client';

import { useEffect, useState } from 'react';
import { getLocalFollowedPlayerIds } from '@/lib/utils/local-follows';
import { ensurePushSubscription, pushSupported } from '@/lib/push-client';

/**
 * Avisos de UM torneio neste aparelho (rodada publicada, resultado de quem
 * a pessoa segue, encerramento). Os avisos da CONTA (convite de equipe,
 * alertas, suporte) são outro botão: AccountPushToggle, em Minha conta.
 * O aparelho segue um torneio por vez; ativar em outro substitui o anterior.
 */
const PUSH_SCOPE_KEY = 'xbr_push_scope';

interface Props {
  tournamentId: string;
  tournamentSlug?: string;
  activeLabel?: string;
  idleLabel?: string;
}

type Status = 'idle' | 'loading' | 'subscribed' | 'denied' | 'unsupported' | 'error';

export function NotifyButton({ tournamentId, activeLabel, idleLabel }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!pushSupported()) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    navigator.serviceWorker.getRegistration('/push-sw.js').then((reg) => {
      if (!reg) return;
      reg.pushManager.getSubscription().then((sub) => {
        if (sub && localStorage.getItem(PUSH_SCOPE_KEY) === tournamentId) {
          setStatus('subscribed');
        }
      });
    });
  }, [tournamentId]);

  useEffect(() => {
    if (status !== 'subscribed') return;

    const syncLocalFollows = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return;
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            tournamentId,
            followedPlayerIds: [...getLocalFollowedPlayerIds(tournamentId)],
          }),
        });
        if (!response.ok) console.error('[NotifyButton] falha ao sincronizar jogadores seguidos');
      } catch (error) {
        console.error('[NotifyButton] falha ao sincronizar jogadores seguidos:', error);
      }
    };

    window.addEventListener('xbr:follows:changed', syncLocalFollows);
    return () => window.removeEventListener('xbr:follows:changed', syncLocalFollows);
  }, [status, tournamentId]);

  async function toggle() {
    setStatus('loading');
    setErrorMsg('');

    try {
      if (status === 'subscribed') {
        const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            // Servidor decide: aparelho ligado a uma conta só deixa de seguir
            // o torneio e continua inscrito para os avisos da conta (kept).
            const res = await fetch('/api/push/subscribe', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            const { kept } = await res.json().catch(() => ({ kept: false }));
            if (!kept) await sub.unsubscribe();
            if (localStorage.getItem(PUSH_SCOPE_KEY) === tournamentId) {
              localStorage.removeItem(PUSH_SCOPE_KEY);
            }
          }
        }
        setStatus('idle');
        return;
      }

      let sub: PushSubscription;
      try {
        sub = await ensurePushSubscription();
      } catch (err) {
        if (err instanceof Error && err.message === 'DENIED') { setStatus('denied'); return; }
        throw err;
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          tournamentId,
          followedPlayerIds: [...getLocalFollowedPlayerIds(tournamentId)],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao salvar subscrição');

      localStorage.setItem(PUSH_SCOPE_KEY, tournamentId);
      setStatus('subscribed');
    } catch (err: any) {
      console.error('[NotifyButton]', err);
      setErrorMsg(err?.message ?? 'Erro desconhecido');
      setStatus('error');
    }
  }

  if (status === 'unsupported') return null;

  const label =
    status === 'subscribed' ? (activeLabel ?? 'Avisos deste torneio ativos') :
    status === 'denied'     ? 'Bloqueado pelo navegador' :
    status === 'loading'    ? 'Aguarde...' :
    status === 'error'      ? 'Erro – tentar novamente' :
    (idleLabel ?? 'Avisar sobre este torneio');

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={status === 'error' ? () => setStatus('idle') : toggle}
        disabled={status === 'loading' || status === 'denied'}
        title={status === 'error' ? errorMsg : label}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50
          ${status === 'subscribed'
            ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
            : status === 'error'
            ? 'border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
            : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
      >
        {status === 'subscribed' ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ) : status === 'error' ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {status === 'error' && errorMsg && (
        <p className="text-xs text-red-500 dark:text-red-400 max-w-[200px] text-right">{errorMsg}</p>
      )}
    </div>
  );
}
