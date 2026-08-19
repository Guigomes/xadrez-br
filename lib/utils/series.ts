import type { SeriesStatus, ClassificationDimension } from '@/types/database';
import { formatDateRange } from '@/lib/utils/date';

/**
 * Série pode não ter data nenhuma (circuito com etapas ainda indefinidas),
 * enquanto formatDateRange exige o início — daí o wrapper em vez de chamar
 * direto em cada tela.
 */
export function formatSeriesPeriod(start: string | null, end: string | null): string {
  if (!start) return end ? `até ${formatDateRange(end, null)}` : 'datas a definir';
  return formatDateRange(start, end);
}

export const SERIES_STATUS_LABEL: Record<SeriesStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicada',
  finished: 'Encerrada',
};

export const SERIES_STATUS_COLOR: Record<SeriesStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  published: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
  finished: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
};

export const DIMENSION_LABEL: Record<ClassificationDimension, string> = {
  age: 'idade',
  rating: 'rating',
  sex: 'feminino',
};

/** Descreve o contrato de classificação em português corrido. */
export function describeDimensions(dims: readonly string[] | null | undefined): string {
  const list = (dims ?? []).filter((d): d is ClassificationDimension => d in DIMENSION_LABEL);
  if (list.length === 0) return 'sem faixas';
  return list.map((d) => DIMENSION_LABEL[d]).join(' + ');
}

/**
 * Igualdade como CONJUNTO — a ordem do array não importa, o conteúdo sim.
 * Mesma regra que add_tournament_to_series aplica no banco (migration 070);
 * aqui é só pra UI conseguir marcar a etapa incompatível ANTES do clique, em
 * vez de deixar o organizador descobrir pelo erro.
 */
export function dimensionsMatch(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined
): boolean {
  const sa = new Set(a ?? []);
  const sb = new Set(b ?? []);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}
