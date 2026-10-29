'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

export function TvControls() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="flex items-center gap-3 text-xs text-brand-200">
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-brand-300" />Atualiza a cada 20s</span>
      <button className="rounded-lg border border-white/30 px-3 py-2 font-semibold text-white hover:bg-white/10" onClick={() => document.documentElement.requestFullscreen?.()}>
        Tela cheia
      </button>
      <button className="rounded-lg border border-white/30 px-3 py-2 font-semibold text-white hover:bg-white/10" onClick={() => history.back()}>
        Sair
      </button>
    </div>
  );
}
