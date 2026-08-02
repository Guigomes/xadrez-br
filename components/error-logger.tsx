'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/log-error-client';

/**
 * Pega o que os error boundaries do Next (app/error.tsx, app/global-
 * error.tsx) não alcançam: erro em handler de evento, throw fora do render,
 * e promise rejeitada sem catch — nenhum dos dois é um erro de render, então
 * não sobe pelo boundary do React. Monta incondicionalmente no layout raiz
 * (mesmo padrão de PwaRegister/ChatWidget), sem UI própria.
 */
export function ErrorLogger() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportClientError(event.error ?? event.message, { kind: 'window.onerror' });
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError(event.reason, { kind: 'unhandledrejection' });
    }
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
