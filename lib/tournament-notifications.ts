import type { GameResult } from '@/types/database';

export const UNGROUPED_CATEGORY = '__ungrouped__';

export function categoryKey(pairingGroupId: string | null): string {
  return pairingGroupId ?? UNGROUPED_CATEGORY;
}

export function subscriptionTracksPlayers(
  subscription: { userId: string | null; followedPlayerIds: string[] },
  trackedUserIds: Set<string>,
  relevantPlayerIds?: Set<string>,
): boolean {
  if (subscription.userId && trackedUserIds.has(subscription.userId)) return true;
  if (!relevantPlayerIds) return subscription.followedPlayerIds.length > 0;
  return subscription.followedPlayerIds.some((playerId) => relevantPlayerIds.has(playerId));
}

export function summarizeCategoryRounds(
  expectedCategoryKeys: string[],
  rounds: Array<{ categoryKey: string; status: string; results: string[] }>,
) {
  const roundsByCategory = new Map(rounds.map((round) => [round.categoryKey, round]));
  const allStarted = expectedCategoryKeys.every((key) => {
    const round = roundsByCategory.get(key);
    return !!round
      && (round.status === 'ongoing' || round.status === 'finished')
      && round.results.length > 0;
  });
  const allFinished = allStarted && expectedCategoryKeys.every((key) => {
    const round = roundsByCategory.get(key)!;
    return round.status === 'finished'
      && round.results.length > 0
      && round.results.every(isFinalResult);
  });

  return { allStarted, allFinished, categoryCount: expectedCategoryKeys.length };
}

export function isFinalResult(result: string): result is Exclude<GameResult, '*'> {
  return result !== '*';
}

export function groupRoundStartedEventKey(roundId: string): string {
  return `group-round-started:${roundId}`;
}

/**
 * Chave estável de "rodada iniciada": uma por torneio + grupo + número da rodada.
 * A chave antiga usava o id da rodada, e rodada apagada e reimportada ganha id novo
 * — o aviso saía de novo a cada recriação (3 pushes iguais no mesmo torneio).
 */
export function groupRoundStartedStableKey(
  tournamentId: string,
  pairingGroupId: string | null,
  roundNumber: number,
): string {
  return `group-round-started:${tournamentId}:${categoryKey(pairingGroupId)}:${roundNumber}`;
}

/** Mesma ideia da chave acima, para o aviso de resultado de uma mesa. */
export function playerResultStableKey(pairing: {
  tournamentId: string;
  pairingGroupId: string | null;
  roundNumber: number;
  boardNumber: number | null;
  whiteTpId: string | null;
  blackTpId: string | null;
  result: string;
}): string {
  const pairingKey = pairing.boardNumber?.toString()
    ?? `${pairing.whiteTpId ?? ''}:${pairing.blackTpId ?? ''}`;
  return `player-result:${pairing.tournamentId}:${categoryKey(pairing.pairingGroupId)}:${pairing.roundNumber}:${pairingKey}:${pairing.result}`;
}

export function allRoundsStartedEventKey(tournamentId: string, roundNumber: number): string {
  return `all-rounds-started:${tournamentId}:${roundNumber}`;
}

export function allResultsFinishedEventKey(tournamentId: string, roundNumber: number): string {
  return `all-results-finished:${tournamentId}:${roundNumber}`;
}

export function playerResultEventKey(pairing: {
  roundId: string;
  boardNumber: number | null;
  whiteTpId: string | null;
  blackTpId: string | null;
  result: string;
}): string {
  const pairingKey = pairing.boardNumber?.toString()
    ?? `${pairing.whiteTpId ?? ''}:${pairing.blackTpId ?? ''}`;
  return `player-result:${pairing.roundId}:${pairingKey}:${pairing.result}`;
}

export function resultNotificationBody(
  result: string,
  whiteName: string,
  blackName: string | null,
): string {
  if (result === 'bye') return `${whiteName} recebeu BYE.`;
  if (result === 'not_paired') return `${whiteName} não teve emparceiramento.`;
  if (!blackName) return `Resultado de ${whiteName} publicado.`;

  if (result === '1-0' || result === 'forfeit_black') {
    return `${whiteName} venceu ${blackName}.`;
  }
  if (result === '0-1' || result === 'forfeit_white') {
    return `${blackName} venceu ${whiteName}.`;
  }
  if (result === '1/2-1/2') {
    return `${whiteName} e ${blackName} empataram.`;
  }
  if (result === 'double_forfeit') {
    return `${whiteName} e ${blackName}: duplo W.O.`;
  }
  return `Resultado de ${whiteName} × ${blackName} publicado.`;
}
