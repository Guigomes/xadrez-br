/** Games played excludes WO and byes, so it cannot alone identify a starting list. */
export function isInitialStandings(
  rows: ReadonlyArray<{ games_played: number | null; points: number | null }>,
  hasRecordedResult: boolean,
): boolean {
  return !hasRecordedResult && rows.every((row) => !row.games_played && !Number(row.points));
}
