import type { TimeControlKind, RatingKind } from '@/types/database';

/**
 * Fonte única dos ritmos de jogo oferecidos na criação de torneio. O select
 * grava `time_control` (texto exibido) E `time_control_kind` (categoria pra
 * busca/estatística — migration 061). A categoria também sugere o rating de
 * seed (`rating_kind`), sem forçar: FIDE só tem 3 listas (clássico/rápido/
 * blitz), então bullet cai em blitz pra efeito de seed.
 */
export interface TimeControlPreset {
  /** Texto gravado em tournaments.time_control e exibido ao público. */
  value: string;
  /** Rótulo no select. */
  label: string;
  kind: TimeControlKind;
  /** Rating sugerido pro seed ao escolher este ritmo (não é imposto). */
  suggestedRatingKind: RatingKind;
}

export const TIME_CONTROL_PRESETS: TimeControlPreset[] = [
  { value: 'G/1+0',    label: 'Bullet · G/1',          kind: 'bullet',    suggestedRatingKind: 'blz' },
  { value: 'G/2+1',    label: 'Bullet · G/2+1',        kind: 'bullet',    suggestedRatingKind: 'blz' },
  { value: 'G/3+2',    label: 'Blitz · G/3+2',         kind: 'blitz',     suggestedRatingKind: 'blz' },
  { value: 'G/5+0',    label: 'Blitz · G/5',           kind: 'blitz',     suggestedRatingKind: 'blz' },
  { value: 'G/5+3',    label: 'Blitz · G/5+3',         kind: 'blitz',     suggestedRatingKind: 'blz' },
  { value: 'G/10+5',   label: 'Rápido · G/10+5',       kind: 'rapid',     suggestedRatingKind: 'rpd' },
  { value: 'G/15+10',  label: 'Rápido · G/15+10',      kind: 'rapid',     suggestedRatingKind: 'rpd' },
  { value: 'G/25+10',  label: 'Rápido · G/25+10',      kind: 'rapid',     suggestedRatingKind: 'rpd' },
  { value: 'G/60+30',  label: 'Clássico · G/60+30',    kind: 'classical', suggestedRatingKind: 'std' },
  { value: '90\'+30"', label: 'Clássico · 90\'+30"',   kind: 'classical', suggestedRatingKind: 'std' },
];

/** Valor especial do select que revela o campo de texto livre. */
export const TIME_CONTROL_OTHER = '__other__';

export const TIME_CONTROL_KIND_LABELS: Record<TimeControlKind, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rápido',
  classical: 'Clássico',
  other: 'Outro',
};

/** Acha o preset por texto exato (usado no edit pra pré-selecionar). */
export function findPresetByValue(value: string | null | undefined): TimeControlPreset | undefined {
  if (!value) return undefined;
  return TIME_CONTROL_PRESETS.find((p) => p.value === value);
}
