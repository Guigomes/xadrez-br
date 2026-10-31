/** A reading cycle: hold the top, scroll slowly, hold the bottom, then repeat/switch. */
export function startTvPlayback(
  viewport: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  onCycle: () => void,
) {
  let frame: number;
  let active = true;
  let previous: number | null = null;
  let elapsed = 0;
  let bottomTime = 0;
  let position = viewport.scrollTop;
  const tick = (time: number) => {
    if (!active) return;
    // Background tabs must not jump ahead or cycle when their RAF resumes.
    if (document.visibilityState === 'hidden') {
      previous = null;
    } else {
      const delta = previous === null ? 0 : Math.min(time - previous, 100);
      previous = time;
      elapsed += delta;
      const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (max <= 1) {
        if (elapsed >= 15_000) complete();
      } else if (elapsed > 4_000) {
        // Keep fractional pixels here: scrollTop can be rounded on some TVs.
        const wasAtBottom = position >= max - 1;
        position = Math.min(max, position + Math.min(delta, elapsed - 4_000) * 18 / 1000);
        viewport.scrollTop = position;
        bottomTime = wasAtBottom ? bottomTime + delta : 0;
        if (bottomTime >= 5_000) complete();
      }
    }
    if (active) frame = requestAnimationFrame(tick);
  };
  const complete = () => {
    elapsed = 0;
    bottomTime = 0;
    position = 0;
    viewport.scrollTop = 0;
    onCycle();
  };
  frame = requestAnimationFrame(tick);
  return () => { active = false; cancelAnimationFrame(frame); };
}
