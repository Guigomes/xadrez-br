import { describe, expect, it, vi } from 'vitest';
import { animateTvVictory, newTvWinner, type TvResultSnapshot } from '../tv-victory';

const snapshot = (patch: Partial<TvResultSnapshot> = {}): TvResultSnapshot => ({
  pairing_id: 'mesa-7', white_tp_id: 'white', black_tp_id: 'black', is_bye: false, result: '*', ...patch,
});

describe('TV victory detection', () => {
  it.each([['1-0', 'white'], ['0-1', 'black'], ['forfeit_black', 'white'], ['forfeit_white', 'black']] as const)(
    'celebrates the correct player for a newly confirmed %s', (result, winner) => {
      expect(newTvWinner(snapshot(), snapshot({ result }))).toBe(winner);
    },
  );
  it.each(['1-0', '0-1', 'forfeit_white', 'forfeit_black'] as const)('does not repeat %s on refresh or initial load', (result) => {
    const row = snapshot({ result });
    expect(newTvWinner(row, { ...row })).toBeNull();
  });
  it.each(['*', '1/2-1/2', 'double_forfeit', 'not_paired'] as const)('does not celebrate %s (including cleared results)', (result) => {
    expect(newTvWinner(snapshot({ result: '1-0' }), snapshot({ result }))).toBeNull();
  });
  it('does not celebrate byes or a changed board/opponent as a newly observed win', () => {
    expect(newTvWinner(snapshot(), snapshot({ is_bye: true, result: 'bye' }))).toBeNull();
    expect(newTvWinner(snapshot(), snapshot({ is_bye: true, result: '1-0' }))).toBeNull();
    for (const identity of ['pairing_id', 'white_tp_id', 'black_tp_id'] as const) {
      expect(newTvWinner(snapshot(), snapshot({ [identity]: 'new-id', result: '1-0' }))).toBeNull();
    }
  });
  it('can highlight a corrected winner and a new result after clearing', () => {
    expect(newTvWinner(snapshot({ result: '1-0' }), snapshot({ result: '0-1' }))).toBe('black');
    expect(newTvWinner(snapshot({ result: '1/2-1/2' }), snapshot({ result: '1-0' }))).toBe('white');
    expect(newTvWinner(snapshot(), snapshot({ result: '1-0' }))).toBe('white');
  });
});

describe('TV victory animation lifecycle', () => {
  function setup() {
    const animation = () => ({ cancel: vi.fn() });
    const trophyAnimation = animation(), nameAnimation = animation(), glowAnimation = animation();
    const trophy = { animate: vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => trophyAnimation) };
    const name = { animate: vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => nameAnimation) };
    const glow = { animate: vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => glowAnimation) };
    const root = { querySelector: vi.fn((selector: string) => selector.includes('trophy') ? trophy : selector.includes('name') ? name : glow) };
    return { root: root as unknown as HTMLElement, query: root.querySelector, trophy, name, glow, trophyAnimation, nameAnimation, glowAnimation };
  }
  it('animates only the winning name/trophy and a non-blocking card glow, once', () => {
    const t = setup();
    animateTvVictory(t.root, 'black', false);
    expect(t.query.mock.calls).toEqual([
      ['[data-tv-player="black"] [data-tv-trophy]'], ['[data-tv-player="black"] [data-tv-name]'], ['[data-tv-victory-glow]'],
    ]);
    expect(t.trophy.animate).toHaveBeenCalledTimes(1);
    expect(t.name.animate).toHaveBeenCalledTimes(1);
    expect(t.glow.animate).toHaveBeenCalledTimes(1);
    expect(t.trophy.animate.mock.calls[0][1]).toEqual({ duration: 2000, easing: 'ease-out' });
    expect(t.glow.animate.mock.calls[0][1]).toEqual({ duration: 2800, easing: 'ease-out' });
  });
  it('respects reduced motion, preserving the static winner highlight', () => {
    const t = setup();
    animateTvVictory(t.root, 'white', true)();
    expect(t.query).not.toHaveBeenCalled();
    expect(t.trophy.animate).not.toHaveBeenCalled();
  });
  it('cancels every in-flight animation on result correction, clearing or unmount', () => {
    const t = setup();
    const stop = animateTvVictory(t.root, 'white', false);
    stop();
    for (const a of [t.trophyAnimation, t.nameAnimation, t.glowAnimation]) expect(a.cancel).toHaveBeenCalledOnce();
  });
  it('works without the Web Animations API on an older TV', () => {
    const root = { querySelector: () => ({}) } as unknown as HTMLElement;
    expect(() => animateTvVictory(root, 'white', false)()).not.toThrow();
  });
  it('does not break score rendering when animation support fails partway', () => {
    const t = setup();
    t.name.animate.mockImplementation(() => { throw new Error('Unsupported animation'); });
    expect(() => animateTvVictory(t.root, 'white', false)).not.toThrow();
    expect(t.trophyAnimation.cancel).toHaveBeenCalledOnce();
  });
});
