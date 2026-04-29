'use client';

import { useEffect, useState } from 'react';

interface Props {
  tournamentId: string;
  tournamentSlug: string;
}

type Status = 'idle' | 'loading' | 'subscribed' | 'denied' | 'unsupported' | 'error';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function NotifyButton({ tournamentId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    // Use getRegistration instead of .ready to avoid hanging forever
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return; // SW not yet registered — stays idle
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setStatus('subscribed');
      });
    });
  }, []);

  async function toggle() {
    setStatus('loading');
    setErrorMsg('');

    try {
      const reg = await navigator.serviceWorker.ready;

      if (status === 'subscribed') {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setStatus('idle');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus('denied'); return; }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('VAPID key not configured');

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), tournamentId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erro ao salvar subscrição');

      setStatus('subscribed');
    } catch (err: any) {
      console.error('[NotifyButton]', err);
      setErrorMsg(err?.message ?? 'Erro desconhecido');
      setStatus('error');
    }
  }

  if (status === 'unsupported') return null;

  const label =
    status === 'subscribed' ? 'Notificações ativas' :
    status === 'denied'     ? 'Bloqueado pelo navegador' :
    status === 'loading'    ? 'Aguarde...' :
    status === 'error'      ? 'Erro – tentar novamente' :
    'Ativar notificações';

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
