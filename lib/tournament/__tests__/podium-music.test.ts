import { existsSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { pausePodiumMusic, PODIUM_MUSIC_TRACKS, startPodiumMusic, type PodiumMusicPlayer } from '../podium-music';

const player = (): PodiumMusicPlayer => ({ currentTime: 42, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() });

describe('local podium music', () => {
  it('offers the two bundled MP3 files, not remote players or video embeds', () => {
    expect(PODIUM_MUSIC_TRACKS.map((track) => track.id)).toEqual(['take-on-me', 'apresentacao']);
    for (const track of PODIUM_MUSIC_TRACKS) {
      expect(track.src).toMatch(/^\/audio\/podium\/[a-z0-9-]+\.mp3$/);
      const path = new URL(`../../../public${track.src}`, import.meta.url);
      expect(existsSync(path)).toBe(true); expect(statSync(path).size).toBeGreaterThan(1_000_000);
    }
  });
  it('restarts at zero when opening/repeating the ceremony', async () => {
    const current = player();
    const playing = startPodiumMusic(current, true);
    expect(current.currentTime).toBe(0);
    expect(current.play).toHaveBeenCalledOnce(); // Called synchronously in the click.
    await expect(playing).resolves.toBe(true);
  });
  it('resumes without rewinding when using the separate play button', async () => {
    const current = player();
    await expect(startPodiumMusic(current)).resolves.toBe(true);
    expect(current.currentTime).toBe(42);
  });
  it('keeps the podium working without an audio element or on blocked/network playback', async () => {
    await expect(startPodiumMusic(null, true)).resolves.toBe(false);
    const current = player();
    current.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    await expect(startPodiumMusic(current, true)).resolves.toBe(false);
    current.play = () => { throw new Error('unavailable'); };
    await expect(startPodiumMusic(current)).resolves.toBe(false);
  });
  it('pauses on category changes or leaving, and tolerates an already released player', () => {
    const current = player(); pausePodiumMusic(current);
    expect(current.pause).toHaveBeenCalledOnce();
    current.pause = () => { throw new Error('already removed'); };
    expect(() => pausePodiumMusic(current)).not.toThrow();
    expect(() => pausePodiumMusic(null)).not.toThrow();
  });
});
