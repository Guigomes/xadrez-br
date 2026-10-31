import type { RoundPairingRow } from '../../types/database';
import { winnerSide } from '../utils/chess';

export type TvResultSnapshot = Pick<RoundPairingRow,
  'pairing_id' | 'white_tp_id' | 'black_tp_id' | 'result' | 'is_bye'>;
export type TvWinner = 'white' | 'black';

/** Existing results / changed seats are a baseline, not a newly observed victory. */
export function newTvWinner(previous: TvResultSnapshot, next: TvResultSnapshot): TvWinner | null {
  if (previous.pairing_id !== next.pairing_id
    || previous.white_tp_id !== next.white_tp_id || previous.black_tp_id !== next.black_tp_id
    || previous.is_bye || next.is_bye || previous.result === next.result) return null;
  if (winnerSide(next.result, 'white') === 'winner') return 'white';
  if (winnerSide(next.result, 'black') === 'winner') return 'black';
  return null;
}

/** Browser-only decoration; no result writes, sounds, focus changes or timers. */
export function animateTvVictory(root: HTMLElement, side: TvWinner, reducedMotion: boolean): () => void {
  const animations: Animation[] = [];
  const stop = () => animations.forEach((animation) => animation.cancel());
  if (reducedMotion) return stop;

  const trophy = root.querySelector<HTMLElement>(`[data-tv-player="${side}"] [data-tv-trophy]`);
  const name = root.querySelector<HTMLElement>(`[data-tv-player="${side}"] [data-tv-name]`);
  const glow = root.querySelector<HTMLElement>('[data-tv-victory-glow]');
  try {
    if (typeof trophy?.animate === 'function') animations.push(trophy.animate([
      { transform: 'translateY(0) rotate(0deg) scale(1)', offset: 0 },
      { transform: 'translateY(-10px) rotate(-12deg) scale(1.45)', offset: 0.2 },
      { transform: 'translateY(-4px) rotate(10deg) scale(1.2)', offset: 0.4 },
      { transform: 'translateY(-7px) rotate(-6deg) scale(1.3)', offset: 0.6 },
      { transform: 'translateY(0) rotate(0deg) scale(1)', offset: 1 },
    ], { duration: 2000, easing: 'ease-out' }));
    if (typeof name?.animate === 'function') animations.push(name.animate([
      { transform: 'translateY(3px)', opacity: 0.65 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 650, easing: 'ease-out' }));
    if (typeof glow?.animate === 'function') animations.push(glow.animate([
      { opacity: 0 }, { opacity: 0.85, offset: 0.18 },
      { opacity: 0.25, offset: 0.5 }, { opacity: 0.65, offset: 0.7 }, { opacity: 0 },
    ], { duration: 2800, easing: 'ease-out' }));
  } catch {
    // Older TV browsers may not implement all animation features. Scores stay usable.
    stop();
  }
  return stop;
}
