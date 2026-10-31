import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTvPlayback } from '../tv-playback';

describe('TV reading cycle', () => {
  let frame: FrameRequestCallback | undefined;
  let time: number;
  let visibility: string;
  const advance = (milliseconds: number) => {
    for (let remaining = milliseconds; remaining > 0; remaining -= 50) {
      time += Math.min(remaining, 50);
      const next = frame; frame = undefined; next?.(time);
    }
  };
  beforeEach(() => {
    time = 0; visibility = 'visible'; frame = undefined;
    vi.stubGlobal('document', { get visibilityState() { return visibility; } });
    vi.stubGlobal('requestAnimationFrame', vi.fn((next: FrameRequestCallback) => { frame = next; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { frame = undefined; }));
  });
  afterEach(() => vi.unstubAllGlobals());
  const viewport = (height = 1000) => ({ scrollTop: 0, clientHeight: 400, scrollHeight: height });

  it('holds the top, then scrolls at 18 px/s without changing views early', () => {
    const element = viewport(); const next = vi.fn(); const stop = startTvPlayback(element, next);
    advance(4050); expect(element.scrollTop).toBe(0);
    advance(1000); expect(element.scrollTop).toBeCloseTo(18);
    expect(next).not.toHaveBeenCalled(); stop();
  });
  it('waits until the last row has been visible before completing a long list', () => {
    const element = viewport(580); const next = vi.fn(); const stop = startTvPlayback(element, next);
    advance(14_050); expect(element.scrollTop).toBeCloseTo(180); expect(next).not.toHaveBeenCalled();
    advance(4900); expect(next).not.toHaveBeenCalled();
    advance(100); expect(next).toHaveBeenCalledOnce(); expect(element.scrollTop).toBe(0); stop();
  });
  it('keeps a fitting or empty view on screen for 15s and cycles repeatedly', () => {
    const element = viewport(300); const next = vi.fn(); const stop = startTvPlayback(element, next);
    advance(15_000); expect(next).not.toHaveBeenCalled();
    advance(50); expect(next).toHaveBeenCalledOnce();
    advance(15_000); expect(next).toHaveBeenCalledTimes(2); expect(element.scrollTop).toBe(0); stop();
  });
  it('does not skip new rows when live data grows during playback', () => {
    const element = viewport(580); const next = vi.fn(); const stop = startTvPlayback(element, next);
    advance(14_050); element.scrollHeight = 1000;
    advance(5000); expect(next).not.toHaveBeenCalled(); expect(element.scrollTop).toBeGreaterThan(180); stop();
  });
  it('pauses in background tabs and never jumps after a throttled frame', () => {
    const element = viewport(); const next = vi.fn(); const stop = startTvPlayback(element, next);
    advance(5050); const position = element.scrollTop; visibility = 'hidden'; advance(60_000);
    expect(element.scrollTop).toBe(position); expect(next).not.toHaveBeenCalled();
    visibility = 'visible'; time += 60_000; advance(50); expect(element.scrollTop).toBe(position);
    time += 60_000; advance(50); expect(element.scrollTop - position).toBeCloseTo(1.8, 8); stop();
  });
  it('cleans up the animation on pause, mode change or unmount', () => {
    const element = viewport(); const next = vi.fn(); const stop = startTvPlayback(element, next);
    advance(5050); const position = element.scrollTop; const pending = frame; stop();
    pending?.(time + 60_000); advance(60_000);
    expect(element.scrollTop).toBe(position); expect(next).not.toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  });
});
