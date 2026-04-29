'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-app py-24 text-center">
      <p className="text-5xl mb-4">⚠️</p>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Algo deu errado
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
        {error.message ?? 'Ocorreu um erro inesperado.'}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );
}
