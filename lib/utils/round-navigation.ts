import type { Round } from '../../types/database';

type NavigableRound = Pick<Round, 'id' | 'round_number' | 'status'>;
/** A string selects an existing round; a number selects preparation for that round. */
export type RoundSelection = string | number | null;

export function resolveRoundSelection(
  rounds: readonly NavigableRound[], limit: number, requestedId: string | null, prepare: string | null,
): RoundSelection {
  if (requestedId && rounds.some((round) => round.id === requestedId)) return requestedId;
  const target = prepare && /^\d+$/.test(prepare) ? Number(prepare) : 0;
  if (target > 0 && target <= limit) {
    return rounds.find((round) => round.round_number === target)?.id ?? target;
  }
  const ordered = [...rounds].sort((a, b) => b.round_number - a.round_number);
  const current = ordered.find((round) => round.status !== 'finished');
  if (current) return current.id;
  const last = ordered[0];
  if (!last) return 1;
  return last.round_number < limit ? last.round_number + 1 : last.id;
}

export function roundPreparationHref(slug: string, groupId: string, roundNumber: number): string {
  const query = new URLSearchParams({ group: groupId, prepare: String(roundNumber) });
  return `/admin/torneios/${encodeURIComponent(slug)}/rodadas?${query}`;
}

export function afterRoundFinishHref(slug: string, groupId: string, nextRound: number, tournamentStatus?: string): string {
  return tournamentStatus === 'finished'
    ? `/admin/torneios/${encodeURIComponent(slug)}/classificacao`
    : roundPreparationHref(slug, groupId, nextRound);
}
