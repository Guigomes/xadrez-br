/** This artwork is authorized for this event only, not for namesakes or copies. */
export const CHESS_AND_KIDS_TOURNAMENT_ID = '23cdc35b-b47a-4424-8cac-a32d878bd328';

export function tournamentLogo(tournamentId: string) {
  return tournamentId === CHESS_AND_KIDS_TOURNAMENT_ID
    ? { src: '/brands/chess-and-kids.jpg', alt: 'Logo Chess And Kids' }
    : null;
}
