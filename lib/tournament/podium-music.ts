export const PODIUM_MUSIC_TRACKS = [
  { id: 'take-on-me', name: 'Take On Me · Brooklyn Duo', src: '/audio/podium/take-on-me-brooklyn-duo.mp3' },
  { id: 'apresentacao', name: 'Trilha para apresentação · jv808tp', src: '/audio/podium/trilha-apresentacao-jv808tp.mp3' },
] as const;

export type PodiumTrackId = typeof PODIUM_MUSIC_TRACKS[number]['id'];
export type PodiumMusicPlayer = Pick<HTMLAudioElement, 'play' | 'pause' | 'currentTime'>;

/** Invoked from a click: play() is called before awaiting, preserving the gesture. */
export async function startPodiumMusic(player: PodiumMusicPlayer | null, restart = false): Promise<boolean> {
  if (!player) return false;
  try {
    if (restart) player.currentTime = 0;
    await player.play();
    return true;
  } catch { return false; }
}

export function pausePodiumMusic(player: PodiumMusicPlayer | null): void {
  try { player?.pause(); } catch { /* Music cannot block the ceremony. */ }
}
