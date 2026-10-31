/** The configured half-point allowance applies only to the first round. */
export function requestedByeScoreForRound(configuredScore: number | null, roundNumber: number): 0 | 0.5 {
  return roundNumber === 1 && configuredScore === 0.5 ? 0.5 : 0;
}
