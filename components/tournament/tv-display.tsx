'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { startTvPlayback } from '@/lib/tournament/tv-playback';
import { animateTvEntrance, tvEffectiveMode, tvPublicationKey, type TvMode, type TvRoundState } from '@/lib/tournament/tv-presentation';

type TvView = Exclude<TvMode, 'alternate'>;

/** Server-rendered slots keep data fetching and rankings out of the playback loop. */
export function TvDisplay({ header, rounds, standings, podium, initialMode = 'round', roundState, tournamentEnded = false }: {
  header: ReactNode; rounds: ReactNode; standings: ReactNode; podium?: ReactNode; initialMode?: 'round' | 'podium';
  roundState?: TvRoundState; tournamentEnded?: boolean;
}) {
  const publication = tvPublicationKey(roundState);
  const [mode, setMode] = useState<TvMode>(initialMode === 'podium' && podium ? 'podium' : 'round');
  const [alternate, setAlternate] = useState<{ publication: string; view: 'round' | 'standings' }>(() => ({ publication, view: 'round' }));
  const [paused, setPaused] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  // Reopening a tournament removes the ceremony, even if this TV selected it earlier.
  const effectiveMode = tvEffectiveMode(mode, !!podium, roundState);
  // A new publication starts with its boards, even if the previous cycle ended on standings.
  const alternateView = alternate.publication === publication ? alternate.view : 'round';
  const view: TvView = effectiveMode === 'alternate' ? alternateView : effectiveMode;
  const waitingForRound = roundState?.status === 'finished';

  // Run before paint to avoid a visible flash before the entrance starts.
  useLayoutEffect(() => {
    if (!viewport.current || view === 'podium') return;
    return animateTvEntrance(viewport.current, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }, [view, publication]);

  useEffect(() => {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!motion) return;
    if (motion.matches) setPaused(true);
    const changed = () => { if (motion.matches) setPaused(true); };
    motion.addEventListener('change', changed);
    return () => motion.removeEventListener('change', changed);
  }, []);

  // Live server refreshes replace the slots, not the mode or scroll progress.
  useLayoutEffect(() => { if (viewport.current) viewport.current.scrollTop = 0; }, [view, mode, publication]);
  useEffect(() => {
    if (paused || view === 'podium' || !viewport.current) return;
    return startTvPlayback(viewport.current, () => {
      if (effectiveMode === 'alternate') setAlternate((current) => ({
        publication, view: current.publication !== publication || current.view === 'round' ? 'standings' : 'round',
      }));
    });
  }, [effectiveMode, view, paused, publication]);

  function selectMode(next: TvMode) {
    setAlternate({ publication, view: 'round' });
    setMode(next);
  }

  return (
    <main className="chess-pattern fixed inset-0 z-50 flex flex-col gap-2 overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 px-4 py-3 text-white sm:px-6">
      <div className={view === 'podium' ? 'hidden' : 'shrink-0'}>{header}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl bg-black/15 p-2">
        <label htmlFor="tv-display-mode" className="text-sm font-semibold text-brand-100">Exibir</label>
        <select id="tv-display-mode" value={effectiveMode} onChange={(event) => selectMode(event.target.value as TvMode)} className="min-h-11 max-w-full rounded-lg border border-white/30 bg-brand-900 px-3 py-2 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <option value="round" disabled={waitingForRound}>Só rodada</option>
          <option value="standings">Só classificação</option>
          <option value="alternate" disabled={waitingForRound}>Alternar rodada e classificação</option>
          {podium && <option value="podium">Pódio · premiação</option>}
        </select>
        {view === 'podium' ? <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Tela cheia</button> : <button type="button" aria-pressed={paused} onClick={() => setPaused((current) => !current)} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          {paused ? 'Retomar apresentação' : 'Pausar apresentação'}
        </button>}
        <p role="status" className="text-xs text-brand-200">
          <span className="font-semibold">{view === 'round' ? 'Rodada' : view === 'podium' ? 'Pódio' : 'Classificação'}</span>
          {' · '}{view === 'podium' ? 'Escolha a categoria e inicie a apresentação' : paused ? 'Rolagem e alternância pausadas' : effectiveMode === 'alternate' ? 'Alterna após exibir toda a lista · rolagem suave' : 'Rolagem automática suave'}
        </p>
      </div>
      {waitingForRound && view !== 'podium' && (
        <div role="status" className="shrink-0 rounded-xl border border-amber-200/30 bg-amber-100/10 px-4 py-3 text-sm font-semibold text-amber-100">
          Rodada {roundState?.number} encerrada. {tournamentEnded ? podium ? 'Confira a classificação final ou apresente o pódio.' : 'Confira a classificação final.' : 'Exibindo a classificação até a próxima rodada ser publicada.'}
        </div>
      )}
      <div ref={viewport} role="region" aria-label={view === 'round' ? 'Mesas da rodada' : view === 'podium' ? 'Apresentação do pódio' : 'Classificação do torneio'} tabIndex={0}
        onWheel={() => setPaused(true)} onTouchStart={() => setPaused(true)}
        onKeyDown={(event) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) setPaused(true); }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 [scroll-behavior:auto] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        {/* Keep cards mounted between views: switching must not reset victory detection. */}
        <section hidden={view !== 'round'}>{rounds}</section>
        <section hidden={view !== 'standings'}>{standings}</section>
        {view === 'podium' && podium}
      </div>
    </main>
  );
}
