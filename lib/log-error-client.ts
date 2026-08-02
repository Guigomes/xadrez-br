'use client';

/**
 * Reporta erro capturado no navegador pra /api/log-error. Usado por
 * app/error.tsx, app/global-error.tsx e components/error-logger.tsx.
 * `fetch` com catch silencioso — se o próprio log falhar (rede caiu, por
 * exemplo), não pode virar mais um erro pro usuário ver.
 */
export function reportClientError(error: unknown, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? null : null;
  const route = typeof window !== 'undefined' ? window.location.pathname : null;

  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack, route, context }),
    keepalive: true,
  }).catch(() => { /* melhor perder o log do que travar a UI por causa dele */ });
}
