'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { startTvPlayback } from '@/lib/tournament/tv-playback';

type TvMode = 'round' | 'standings' | 'alternate';
type TvView = Exclude<TvMode, 'alternate'>;

/** Server-rendered slots keep data fetching and rankings out of the playback loop. */
export function TvDisplay({ header, rounds, standings }: {
  header: ReactNode; rounds: ReactNode; standings: ReactNode;
}) {
  const [mode, setMode] = useState<TvMode>('round');
  const [alternateView, setAlternateView] = useState<TvView>('round');
  const [paused, setPaused] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const view = mode === 'alternate' ? alternateView : mode;

  useEffect(() => {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!motion) return;
    if (motion.matches) setPaused(true);
    const changed = () => { if (motion.matches) setPaused(true); };
    motion.addEventListener('change', changed);
    return () => motion.removeEventListener('change', changed);
  }, []);

  // Live server refreshes replace the slots, not the mode or scroll progress.
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = 0; }, [view, mode]);
  useEffect(() => {
    if (paused || !viewport.current) return;
    return startTvPlayback(viewport.current, () => {
      if (mode === 'alternate') setAlternateView((current) => current === 'round' ? 'standings' : 'round');
    });
  }, [mode, view, paused]);

  function selectMode(next: TvMode) {
    setAlternateView('round');
    setMode(next);
  }

  return (
    <main className="chess-pattern fixed inset-0 z-50 flex flex-col gap-4 overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 px-4 py-4 text-white sm:px-10 sm:py-6">
      <div className="shrink-0">{header}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl bg-black/15 p-3">
        <label htmlFor="tv-display-mode" className="text-sm font-semibold text-brand-100">Exibir</label>
        <select id="tv-display-mode" value={mode} onChange={(event) => selectMode(event.target.value as TvMode)} className="min-h-11 max-w-full rounded-lg border border-white/30 bg-brand-900 px-3 py-2 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <option value="round">Só rodada</option>
          <option value="standings">Só classificação</option>
          <option value="alternate">Alternar rodada e classificação</option>
        </select>
        <button type="button" aria-pressed={paused} onClick={() => setPaused((current) => !current)} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          {paused ? 'Retomar apresentação' : 'Pausar apresentação'}
        </button>
        <p role="status" className="text-xs text-brand-200">
          <span className="font-semibold">{view === 'round' ? 'Rodada' : 'Classificação'}</span>
          {' · '}{paused ? 'Rolagem e alternância pausadas' : mode === 'alternate' ? 'Alterna após exibir toda a lista · rolagem lenta' : 'Rolagem automática lenta'}
        </p>
      </div>
      <div ref={viewport} role="region" aria-label={view === 'round' ? 'Mesas da rodada' : 'Classificação do torneio'} tabIndex={0}
        onWheel={() => setPaused(true)} onTouchStart={() => setPaused(true)}
        onKeyDown={(event) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) setPaused(true); }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 [scroll-behavior:auto] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        {/* Keep cards mounted between views: switching must not reset victory detection. */}
        <section hidden={view !== 'round'}>{rounds}</section>
        <section hidden={view !== 'standings'}>{standings}</section>
      </div>
    </main>
  );
}
