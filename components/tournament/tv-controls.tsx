'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { subscribeToTvUpdates, type TvConnection } from '@/lib/tournament/tv-live';

export function TvControls({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [connection, setConnection] = useState<TvConnection>('connecting');
  useEffect(() => {
    const updates = subscribeToTvUpdates(createClient(), tournamentId, () => router.refresh(), setConnection);
    const resume = () => {
      if (document.visibilityState !== 'hidden') updates.requestRefresh();
    };
    const offline = () => setConnection('fallback');
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    return () => {
      updates.stop();
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [router, tournamentId]);

  return (
    <div className="flex items-center gap-3 text-xs text-brand-200">
      <span role="status" className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${connection === 'live' ? 'animate-pulse bg-brand-300' : 'bg-amber-300'}`} />
        {connection === 'live' ? 'Ao vivo' : connection === 'connecting' ? 'Conectando…' : 'Reconectando · consulta a cada 20s'}
      </span>
      <button className="rounded-lg border border-white/30 px-3 py-2 font-semibold text-white hover:bg-white/10" onClick={() => document.documentElement.requestFullscreen?.()}>
        Tela cheia
      </button>
      <button className="rounded-lg border border-white/30 px-3 py-2 font-semibold text-white hover:bg-white/10" onClick={() => history.back()}>
        Sair
      </button>
    </div>
  );
}
