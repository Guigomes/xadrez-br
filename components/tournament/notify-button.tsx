'use client';

import { useEffect, useState } from 'react';

interface Props {
  tournamentId: string;
  tournamentSlug: string;
}

type Status = 'idle' | 'loading' | 'subscribed' | 'denied' | 'unsupported';

export function NotifyButton({ tournamentId, tournamentSlug }: Props) {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setStatus('subscribed');
      })
    );
  }, []);

  async function toggle() {
    setStatus('loading');
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

    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), tournamentId }),
      });
      setStatus('subscribed');
    } catch {
      setStatus('idle');
    }
  }

  if (status === 'unsupported') return null;

  const label =
    status === 'subscribed' ? 'Notificações ativas' :
    status === 'denied'     ? 'Notificações bloqueadas' :
    status === 'loading'    ? '...' :
    'Ativar notificações';

  const icon = status === 'subscribed' ? (
    // Bell with slash
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );

  return (
    <button
      onClick={toggle}
      disabled={status === 'loading' || status === 'denied'}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50
        ${status === 'subscribed'
          ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
          : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
