import type { GameResult, RoundPairingRow } from '@/types/database';

export type EnteredResult = Exclude<GameResult, 'bye' | 'not_paired'>;
export interface ResultSubmission { pairingId: string; result: EnteredResult }

export const resultMutationKey = (roundId: string) => ['set-pairing-result', roundId] as const;

const POINTS: Record<EnteredResult, [number | null, number | null]> = {
  '1-0': [1, 0],
  '0-1': [0, 1],
  '1/2-1/2': [0.5, 0.5],
  forfeit_white: [0, 1],
  forfeit_black: [1, 0],
  double_forfeit: [0, 0],
  '*': [null, null],
};

export function applyPairingResult(pairing: RoundPairingRow, result: EnteredResult): RoundPairingRow {
  const [white_points, black_points] = POINTS[result];
  return { ...pairing, result, white_points, black_points };
}

/** Preview only: pending mutations never overwrite the last confirmed server data. */
export function previewRoundResults(pairings: RoundPairingRow[], pending: ResultSubmission[]) {
  const byPairing = new Map(pending.map((entry) => [entry.pairingId, entry.result]));
  return pairings.map((pairing) => {
    const result = byPairing.get(pairing.pairing_id);
    return result === undefined ? pairing : applyPairingResult(pairing, result);
  });
}

/** Keep a saving board visible until confirmation, including during cache updates. */
export function ongoingResultPairingIds(pairings: RoundPairingRow[], pending: ResultSubmission[]) {
  const savingIds = new Set(pending.map((entry) => entry.pairingId));
  return new Set(pairings
    .filter((pairing) => !pairing.is_bye
      && (pairing.result === '*' || savingIds.has(pairing.pairing_id)))
    .map((pairing) => pairing.pairing_id));
}
