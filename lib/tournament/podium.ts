import type { StandingRow } from '../../types/database';
import { compareGroupNames } from '../utils/chess';

export interface PodiumPlayer {
  position: number;
  playerId: string;
  name: string;
  fideName: string | null;
  title: string | null;
  points: number;
}
export interface PodiumOption { id: string; label: string; players: PodiumPlayer[] }
type PodiumRules = { status: string; has_absolute_classification?: boolean | null; has_female_classification?: boolean | null };

/** Match StandingsView: absolute/female/categories are cuts WITHIN each pairing group.
 * Preserve official source order/tiebreaks; never rank different pairing groups together. */
export function buildPodiumOptions(rows: readonly StandingRow[], rules: PodiumRules): PodiumOption[] {
  if (rules.status !== 'finished') return [];
  const groups = new Map<string | null, string>();
  for (const row of rows) groups.set(row.pairing_group_id, row.pairing_group_name ?? 'Grupo');
  const options: PodiumOption[] = [];
  for (const [groupId, groupName] of groups) {
    const groupRows = rows.filter((row) => row.pairing_group_id === groupId);
    const categories = new Map<string, string>();
    for (const row of groupRows) if (row.category_id && row.category_name) categories.set(row.category_id, row.category_name);
    const add = (key: string, label: string, candidates: readonly StandingRow[], absolute = false) => {
      // Missing final ranks are not permission to invent winners from points or seed.
      const ranked = candidates.filter((row) => row.rank !== null && row.rank > 0);
      const winners = absolute
        ? [1, 2, 3].flatMap((position) => { const row = ranked.find((item) => item.rank === position); return row ? [{ row, position }] : []; })
        : ranked.slice(0, 3).map((row, index) => ({ row, position: index + 1 }));
      options.push({
        id: `${groupId ?? 'ungrouped'}:${key}`,
        label: groups.size > 1 ? `${groupName} · ${label}` : label,
        players: winners.map(({ row, position }) => ({ position, playerId: row.player_id, name: row.full_name, fideName: row.fide_name, title: row.title, points: row.points })),
      });
    };
    if (rules.has_absolute_classification !== false || !categories.size) add('all', 'Absoluto', groupRows, true);
    for (const [id, name] of [...categories].sort((a, b) => compareGroupNames(a[1], b[1]))) {
      add(`category:${id}`, name, groupRows.filter((row) => row.category_id === id));
    }
    if (rules.has_female_classification && groupRows.some((row) => row.sex === 'w')) {
      add('female', 'Feminino', groupRows.filter((row) => row.sex === 'w'));
    }
  }
  return options;
}

export function podiumPhotoUrl(slug: string, option: string, playerId: string) {
  const query = new URLSearchParams({ category: option, player: playerId });
  return `/api/tournaments/${encodeURIComponent(slug)}/podium-photo?${query}`;
}

/** Bronze, silver, then gold. A refresh must not start this timeline again. */
export function startPodiumCeremony(reveal: (stage: number) => void, reducedMotion: boolean, positions: readonly number[] = [3, 2, 1]) {
  if (reducedMotion) { reveal(3); return () => {}; }
  const awards = [...new Set(positions)].filter((position) => [1, 2, 3].includes(position)).sort((a, b) => b - a);
  const timers = awards.map((position, index) => setTimeout(() => reveal(4 - position), 1500 + index * 4500));
  return () => timers.forEach(clearTimeout);
}
