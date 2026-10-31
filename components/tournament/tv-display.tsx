'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TvVictoryContext, type TvVictoryAnnounce } from './tv-victory-context';
import { startTvPlayback } from '@/lib/tournament/tv-playback';
import { animateTvEntrance, tvEffectiveMode, tvPublicationKey, tvVictoryAction, type TvMode, type TvRoundState } from '@/lib/tournament/tv-presentation';

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
  // Vitória vista na classificação (modo Alternar): mostra as mesas na hora e toca a animação já
  // com a mesa visível. Fica depois do reset de rolagem acima para a posição escolhida valer, e a
  // apresentação (efeito abaixo) retoma dali.
  const latest = useRef({ view, effectiveMode, paused, publication });
  latest.current = { view, effectiveMode, paused, publication };
  const pendingVictories = useRef<Array<{ card: HTMLElement; play: () => () => void; stop: (() => void) | null; cancelled: boolean }>>([]);
  const announceVictory = useCallback<TvVictoryAnnounce>((card, play) => {
    const now = latest.current;
    const action = tvVictoryAction(now.view, now.effectiveMode, now.paused);
    if (action === 'play') return play();
    if (action === 'skip') return () => {};
    const entry = { card, play, stop: null as (() => void) | null, cancelled: false };
    pendingVictories.current.push(entry);
    setAlternate({ publication: now.publication, view: 'round' });
    return () => { entry.cancelled = true; entry.stop?.(); };
  }, []);
  useLayoutEffect(() => {
    if (view !== 'round' || pendingVictories.current.length === 0) return;
    const queued = pendingVictories.current.filter((entry) => !entry.cancelled);
    pendingVictories.current = [];
    const area = viewport.current;
    const first = queued[0]?.card;
    if (area && first) {
      const box = area.getBoundingClientRect();
      const row = first.getBoundingClientRect();
      area.scrollTop += row.top - box.top - (box.height - row.height) / 2;
    }
    queued.forEach((entry) => { entry.stop = entry.play(); });
  }, [view]);

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
      {/* Controles ao lado do cabeçalho (não numa faixa própria): a TV ganha uma linha inteira para as mesas. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className={view === 'podium' ? 'hidden' : 'min-w-0 flex-1'}>{header}</div>
        <div className="flex shrink-0 flex-col gap-2 rounded-xl bg-black/15 p-2">
          <div className="flex items-center gap-2">
            <label htmlFor="tv-display-mode" className="text-sm font-semibold text-brand-100">Exibir</label>
            <select id="tv-display-mode" value={effectiveMode} onChange={(event) => selectMode(event.target.value as TvMode)} className="min-h-11 max-w-full rounded-lg border border-white/30 bg-brand-900 px-3 py-2 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <option value="round" disabled={waitingForRound}>Só rodada</option>
              <option value="standings">Só classificação</option>
              <option value="alternate" disabled={waitingForRound}>Alternar rodada e classificação</option>
              {podium && <option value="podium">Pódio · premiação</option>}
            </select>
          </div>
          {view === 'podium' ? <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Tela cheia</button> : <button type="button" aria-pressed={paused} onClick={() => setPaused((current) => !current)} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            {paused ? 'Retomar apresentação' : 'Pausar apresentação'}
          </button>}
          {view === 'podium' && <p role="status" className="max-w-[16rem] text-xs text-brand-200">Escolha a categoria e inicie a apresentação</p>}
        </div>
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
        <TvVictoryContext.Provider value={announceVictory}>
          <section hidden={view !== 'round'}>{rounds}</section>
        </TvVictoryContext.Provider>
        <section hidden={view !== 'standings'}>{standings}</section>
        {view === 'podium' && podium}
      </div>
    </main>
  );
}
