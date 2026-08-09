// Espelho em TS da regra de derivação da migration 035
// (`derive_player_category` em supabase/migrations/035_classification_partition.sql).
// Usado no preview de geração do admin e na pré-seleção da inscrição pública.
// Qualquer mudança na regra precisa ir nos dois lugares — a fonte da verdade
// pro que realmente roda na aprovação é a função SQL; isto aqui é só preview
// client-side, sempre sujeito a divergir se o dado mudar entre o preview e a
// aprovação (ex: organizador edita rating_std depois).

// Import relativo (não '@/...') de propósito: vitest não tem o alias '@/'
// configurado (funciona pra `import type`, que o esbuild elide, mas não pra
// valor em runtime — ver lib/pairing/warnings.ts pro caso type-only).
import { AGE_PRESETS, RATING_PRESETS, type AgePreset, type RatingPreset } from '../constants/classification-presets';

export interface ClassificationCriteria {
  sex: 'm' | 'w' | null;
  minAge: number | null;
  maxAge: number | null;
  minRating: number | null;
  maxRating: number | null;
}

export interface CategoryCandidate extends ClassificationCriteria {
  id: string;
  sortOrder: number;
}

export interface PlayerForMatch {
  sex: 'm' | 'w' | null;
  birthYear: number | null;
  ratingStd: number | null;
}

function specificity(c: ClassificationCriteria): number {
  return (
    (c.sex !== null ? 1 : 0) +
    (c.minAge !== null || c.maxAge !== null ? 1 : 0) +
    (c.minRating !== null || c.maxRating !== null ? 1 : 0)
  );
}

function matches(c: ClassificationCriteria, player: PlayerForMatch, age: number | null): boolean {
  if (c.sex !== null && (player.sex === null || player.sex !== c.sex)) return false;

  if (c.minAge !== null || c.maxAge !== null) {
    if (age === null) return false;
    if (c.minAge !== null && age < c.minAge) return false;
    if (c.maxAge !== null && age > c.maxAge) return false;
  }

  if (c.minRating !== null || c.maxRating !== null) {
    if (player.ratingStd === null) return false;
    if (c.minRating !== null && player.ratingStd < c.minRating) return false;
    if (c.maxRating !== null && player.ratingStd > c.maxRating) return false;
  }

  return true;
}

/**
 * Entre as classificações candidatas, acha a mais específica que o jogador
 * satisfaz. `candidates` já deve vir filtrado pro escopo certo (torneio,
 * grupo de emparceiramento) — esta função só aplica o critério idade/rating/sexo
 * e o desempate por especificidade (mulher Sub-17 cai em "Sub-17 Feminino", não
 * "Sub-17").
 */
export function deriveCategory<T extends CategoryCandidate>(
  candidates: T[],
  player: PlayerForMatch,
  tournamentStartYear: number | null
): T | null {
  const age =
    player.birthYear !== null && tournamentStartYear !== null
      ? tournamentStartYear - player.birthYear
      : null;

  let best: T | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    if (!matches(c, player, age)) continue;
    const score = specificity(c);
    if (score > bestScore || (score === bestScore && best !== null && c.sortOrder < best.sortOrder)) {
      best = c;
      bestScore = score;
    }
  }

  return best;
}

// ------------------------------------------------------------
// Geração das células a partir das 3 perguntas de faixa (produto cartesiano
// exclusivo — partição, célula vazia descartada porque ela é o Absoluto).
// A 4ª pergunta (haverá classificação absoluta? migration 065) não entra aqui:
// o absoluto é transversal, não uma célula da partição — vive em
// tournaments.has_absolute_classification.
// ------------------------------------------------------------

export interface GeneratedCell extends ClassificationCriteria {
  name: string;
}

export interface GenerationInput {
  ageBands: AgePreset[];
  ratingBands: RatingPreset[];
  female: boolean;
}

export function generateClassificationCells({ ageBands, ratingBands, female }: GenerationInput): GeneratedCell[] {
  const ageValues: (AgePreset | null)[] = ageBands.length > 0 ? ageBands : [null];
  const ratingValues: (RatingPreset | null)[] = ratingBands.length > 0 ? ratingBands : [null];
  const sexValues: ('w' | null)[] = female ? [null, 'w'] : [null];

  const cells: GeneratedCell[] = [];

  for (const age of ageValues) {
    for (const rating of ratingValues) {
      for (const sex of sexValues) {
        if (age === null && rating === null && sex === null) continue; // é o Absoluto, não vira célula

        const nameParts = [age?.name, rating?.name, sex === 'w' ? 'Feminino' : null].filter(
          (p): p is string => !!p
        );

        cells.push({
          name: nameParts.join(' '),
          sex,
          minAge: age?.minAge ?? null,
          maxAge: age?.maxAge ?? null,
          minRating: rating?.minRating ?? null,
          maxRating: rating?.maxRating ?? null,
        });
      }
    }
  }

  return cells;
}

export { AGE_PRESETS, RATING_PRESETS };
