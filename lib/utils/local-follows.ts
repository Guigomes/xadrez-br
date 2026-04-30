const KEY = 'xbr_follows';

interface LocalFollow {
  playerId: string;
  tournamentId: string | null;
}

function load(): LocalFollow[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function save(follows: LocalFollow[]) {
  localStorage.setItem(KEY, JSON.stringify(follows));
  window.dispatchEvent(new Event('xbr:follows:changed'));
}

export function isLocallyFollowed(playerId: string, tournamentId: string | null): boolean {
  return load().some((f) => f.playerId === playerId && f.tournamentId === (tournamentId ?? null));
}

export function toggleLocalFollow(playerId: string, tournamentId: string | null): boolean {
  const follows = load();
  const tid = tournamentId ?? null;
  const idx = follows.findIndex((f) => f.playerId === playerId && f.tournamentId === tid);
  if (idx >= 0) {
    follows.splice(idx, 1);
    save(follows);
    return false;
  }
  follows.push({ playerId, tournamentId: tid });
  save(follows);
  return true;
}

export function getLocalFollowedPlayerIds(tournamentId: string): Set<string> {
  return new Set(
    load()
      .filter((f) => f.tournamentId === tournamentId)
      .map((f) => f.playerId)
  );
}
