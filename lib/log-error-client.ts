'use client';

/**
 * Erros que não são da aplicação e só poluem o painel (/admin/dev/errors):
 * extensão de carteira cripto injetada em toda página (MetaMask e afins) e
 * o loop benigno do ResizeObserver, que os navegadores reportam sozinhos.
 * Lista curta e literal de propósito — filtro largo demais engoliria erro
 * de verdade, que é o que essa tabela existe pra pegar.
 */
const IGNORED_MESSAGES = [
  'Failed to connect to MetaMask',
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
];

/** Stack apontando pro código da extensão, não pro nosso bundle. */
const EXTENSION_STACK = /(chrome|moz|safari(-web)?)-extension:\/\//;

function isNoise(message: string, stack: string | null): boolean {
  if (IGNORED_MESSAGES.some((m) => message.includes(m))) return true;
  return !!stack && EXTENSION_STACK.test(stack);
}

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

  if (isNoise(message, stack)) return;

  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stack, route, context }),
    keepalive: true,
  }).catch(() => { /* melhor perder o log do que travar a UI por causa dele */ });
}
