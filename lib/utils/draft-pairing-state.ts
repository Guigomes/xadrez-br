import type { RoundPairingRow } from '../../types/database';
import { requestedByeScoreForRound } from '../pairing/requested-bye';

export interface DraftParticipant {
  id: string;
  status: string;
  joined_at_round?: number | null;
}

/** Compare persisted seats with current eligibility, not a transient dirty flag.
 * Manual swaps remain valid: opponent order and colors are intentionally ignored.
 * null means the data needed to validate the draft has not loaded yet.
 */
export function draftNeedsRecalculation({
  pairings, players, requestedByeIds, roundNumber, requestedByeScore, roundRobin = false,
}: {
  pairings: readonly RoundPairingRow[] | undefined;
  players: readonly DraftParticipant[] | undefined;
  requestedByeIds: ReadonlySet<string> | undefined;
  roundNumber: number;
  requestedByeScore: number | null;
  roundRobin?: boolean;
}): boolean | null {
  if (!pairings || !players || (!roundRobin && !requestedByeIds)) return null;
  // Berger uses the fixed roster, while Swiss excludes inactive/late entrants.
  const eligible = new Set(players.filter(player => roundRobin
    || (player.status === 'active' && (player.joined_at_round ?? 1) <= roundNumber)).map(player => player.id));
  const seated = pairings.flatMap(pairing => [pairing.white_tp_id, pairing.black_tp_id]
    .filter((id): id is string => !!id));
  const actual = new Set(seated);
  if (!pairings.length || seated.length !== actual.size || actual.size !== eligible.size
    || seated.some(id => !eligible.has(id))) return true;
  if (roundRobin) return false;

  const requestedScore = requestedByeScoreForRound(requestedByeScore, roundNumber);
  return pairings.some(pairing => {
    const whiteAbsent = !!pairing.white_tp_id && requestedByeIds!.has(pairing.white_tp_id);
    const blackAbsent = !!pairing.black_tp_id && requestedByeIds!.has(pairing.black_tp_id);
    if (!pairing.is_bye) return whiteAbsent || blackAbsent;
    if (pairing.black_tp_id || pairing.white_points === null) return true;
    return Number(pairing.white_points) !== (whiteAbsent ? requestedScore : 1);
  });
}
