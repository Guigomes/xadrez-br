// Faixas prontas pra montar classificações rápido na tela de admin. Ano
// (não idade em anos-mês) — convenção CBX: idade = ano do torneio - ano de
// nascimento.

export interface AgePreset {
  name: string;
  minAge: number | null;
  maxAge: number | null;
}

// Sub-N é cumulativo (maxAge só, sem minAge) de propósito: um jogador de 6
// anos bate com Sub-6, Sub-7, ..., Sub-19 ao mesmo tempo. A ordem do array
// vira sort_order, e o desempate por sort_order (derive_player_category)
// escolhe a MENOR faixa que ele satisfaz — é isso que classifica cada um na
// categoria mais nova que ele ainda cabe, sem precisar de minAge.
export const AGE_PRESETS: AgePreset[] = [
  { name: 'Sub-6', minAge: null, maxAge: 6 },
  { name: 'Sub-7', minAge: null, maxAge: 7 },
  { name: 'Sub-8', minAge: null, maxAge: 8 },
  { name: 'Sub-9', minAge: null, maxAge: 9 },
  { name: 'Sub-10', minAge: null, maxAge: 10 },
  { name: 'Sub-11', minAge: null, maxAge: 11 },
  { name: 'Sub-12', minAge: null, maxAge: 12 },
  { name: 'Sub-13', minAge: null, maxAge: 13 },
  { name: 'Sub-14', minAge: null, maxAge: 14 },
  { name: 'Sub-15', minAge: null, maxAge: 15 },
  { name: 'Sub-16', minAge: null, maxAge: 16 },
  { name: 'Sub-17', minAge: null, maxAge: 17 },
  { name: 'Sub-18', minAge: null, maxAge: 18 },
  { name: 'Sub-19', minAge: null, maxAge: 19 },
  { name: 'Sênior 50+', minAge: 50, maxAge: null },
  { name: 'Sênior 65+', minAge: 65, maxAge: null },
];

export interface RatingPreset {
  name: string;
  minRating: number | null;
  maxRating: number | null;
}

export const RATING_PRESETS: RatingPreset[] = [
  { name: 'Até 1399', minRating: null, maxRating: 1399 },
  { name: '1400–1599', minRating: 1400, maxRating: 1599 },
  { name: '1600–1799', minRating: 1600, maxRating: 1799 },
  { name: '1800–1999', minRating: 1800, maxRating: 1999 },
  { name: '2000+', minRating: 2000, maxRating: null },
];

/** Acima disso o preview avisa antes de gerar (ex: 14 idades × 5 ratings × 2 sexos passa longe disso). */
export const CLASSIFICATION_COUNT_WARNING_THRESHOLD = 12;
