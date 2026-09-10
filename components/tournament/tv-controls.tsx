'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function TvControls() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />Atualiza a cada 20s</span>
      <button className="rounded-lg border border-gray-300 px-3 py-2 font-semibold hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800" onClick={() => document.documentElement.requestFullscreen?.()}>
        Tela cheia
      </button>
      <button className="rounded-lg border border-gray-700 px-3 py-2 font-semibold text-gray-300 hover:bg-gray-800" onClick={() => history.back()}>
        Sair
      </button>
    </div>
  );
}
