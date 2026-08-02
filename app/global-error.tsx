'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/log-error-client';

/**
 * Só dispara quando o erro acontece no próprio root layout (app/layout.tsx)
 * — app/error.tsx não alcança esse caso, precisa substituir <html>/<body>
 * inteiro. Sem Tailwind aqui de propósito: se o layout quebrou, não dá pra
 * confiar que o CSS carregou certo.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError(error, { digest: error.digest, boundary: 'app/global-error.tsx' });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</p>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Algo deu errado</h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          {error.message || 'Ocorreu um erro inesperado.'}
        </p>
        <button
          onClick={reset}
          style={{
            borderRadius: '0.5rem',
            background: '#2d6e4e',
            color: 'white',
            padding: '0.625rem 1.25rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
