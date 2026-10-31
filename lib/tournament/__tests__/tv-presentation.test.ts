import { describe, expect, it, vi } from 'vitest';
import { animateTvEntrance, tvEffectiveMode, tvPublicationKey, type TvRoundState } from '../tv-presentation';

const round: TvRoundState = { id: 'round-1', number: 1, status: 'ongoing', publishedAt: '2026-10-31T12:00:00Z' };

describe('TV lifecycle presentation', () => {
  it.each(['round', 'standings', 'alternate'] as const)('shows standings after finishing and restores the %s preference on publication', (mode) => {
    expect(tvEffectiveMode(mode, false, { ...round, status: 'finished' })).toBe('standings');
    expect(tvEffectiveMode(mode, false, { ...round, id: 'round-2', number: 2 })).toBe(mode);
  });
  it('does not infer closure from scores or suppress an explicit finished-event podium', () => {
    expect(tvEffectiveMode('round', false, round)).toBe('round');
    expect(tvEffectiveMode('podium', true, { ...round, status: 'finished' })).toBe('podium');
    expect(tvEffectiveMode('podium', false, round)).toBe('round');
    expect(tvEffectiveMode('podium', false, { ...round, status: 'finished' })).toBe('standings');
    expect(tvEffectiveMode('round', false)).toBe('round');
  });
  it('keys entrances by publication, not object identity or score refreshes', () => {
    expect(tvPublicationKey()).toBe('waiting');
    expect(tvPublicationKey({ ...round })).toBe(tvPublicationKey(round));
    expect(tvPublicationKey({ ...round, status: 'finished' })).toBe(tvPublicationKey(round));
    expect(tvPublicationKey({ ...round, id: 'round-2' })).not.toBe(tvPublicationKey(round));
    expect(tvPublicationKey({ ...round, publishedAt: '2026-10-31T12:10:00Z' })).not.toBe(tvPublicationKey(round));
  });
});

describe('TV entrance animation', () => {
  it('fades/slides in and cancels on view change or unmount', () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel })) as unknown as HTMLElement['animate'];
    const stop = animateTvEntrance({ animate }, false);
    expect(animate).toHaveBeenCalledWith([
      { opacity: 0.15, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' });
    stop(); expect(cancel).toHaveBeenCalledOnce();
  });
  it('honors reduced motion and gracefully handles older TV browsers', () => {
    const animate = vi.fn() as unknown as HTMLElement['animate'];
    animateTvEntrance({ animate }, true)(); expect(animate).not.toHaveBeenCalled();
    expect(() => animateTvEntrance({} as Pick<HTMLElement, 'animate'>, false)()).not.toThrow();
    expect(() => animateTvEntrance({ animate: (() => { throw new Error('unavailable'); }) as HTMLElement['animate'] }, false)()).not.toThrow();
  });
});
