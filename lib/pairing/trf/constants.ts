// Posições de coluna (1-based) da linha 001 do TRF FIDE e códigos de resultado.
// Referência: design-tecnico-torneios-nativos.md §4.3, validado no spike F0.

export const COL = {
  startno: [5, 8],
  sex: [10, 10],
  title: [11, 13],
  name: [15, 47],
  rating: [49, 52],
  federation: [54, 56],
  fideId: [58, 68],
  birth: [70, 79],
  points: [81, 84],
  rank: [86, 89],
  roundBase: 92, // opp: 92-95, cor: 97, resultado: 99 — +10 por rodada
} as const;

export const ROUND_WIDTH = 10;

/** Código TRF de bye por tipo (coluna de resultado; opp=0000, cor='-'). */
export const BYE_CODE: Record<string, string> = {
  pairing: 'U',
  requested_half: 'H',
  requested_zero: 'Z',
  late_entry: 'Z',
};
