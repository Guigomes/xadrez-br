export type TvMode = 'round' | 'standings' | 'alternate' | 'podium';
export interface TvRoundState {
  id: string;
  number: number;
  status: 'ongoing' | 'finished';
  publishedAt: string | null;
}

/** Finishing means an explicit lifecycle transition, never just all scores entered.
 * Keep the operator's preferred mode: it resumes when the next round is published. */
export function tvEffectiveMode(mode: TvMode, hasPodium: boolean, round?: TvRoundState): TvMode {
  if (mode === 'podium' && hasPodium) return 'podium';
  if (round?.status === 'finished') return 'standings';
  return mode === 'podium' ? 'round' : mode;
}

/**
 * O que fazer quando uma mesa observa uma vitória nova. Com as mesas na tela, a animação toca na hora.
 * No modo Alternar e com a classificação aparecendo (e a apresentação rodando), a TV volta para as
 * mesas e só então toca. Pausada, só classificação ou pódio: a animação não seria vista, então nada.
 */
export function tvVictoryAction(view: 'round' | 'standings' | 'podium', effectiveMode: TvMode, paused: boolean): 'play' | 'show-round' | 'skip' {
  if (view === 'round') return 'play';
  return view === 'standings' && effectiveMode === 'alternate' && !paused ? 'show-round' : 'skip';
}

export function tvPublicationKey(round?: TvRoundState): string {
  return round ? `${round.id}:${round.publishedAt ?? ''}` : 'waiting';
}

/** Animate the new view/publication, NOT result polling. No remount of score cards. */
export function animateTvEntrance(element: Pick<HTMLElement, 'animate'>, reducedMotion: boolean) {
  if (reducedMotion || !element.animate) return () => {};
  try {
    const animation = element.animate([
      { opacity: 0.15, transform: 'translateY(18px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' });
    return () => animation.cancel();
  } catch { return () => {}; }
}
