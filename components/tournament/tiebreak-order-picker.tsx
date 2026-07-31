'use client';

import type { TiebreakKey } from '@/types/database';
import { TiebreakLegendButton } from './tiebreak-legend-button';

const LABELS: Record<TiebreakKey, string> = {
  buchholz: 'Buchholz',
  buchholz_cut1: 'Buchholz Cut-1',
  sonneborn_berger: 'Sonneborn-Berger',
  wins: 'Nº de vitórias',
  progressive: 'Progressivo',
};
const ALL: TiebreakKey[] = ['buchholz', 'buchholz_cut1', 'sonneborn_berger', 'wins', 'progressive'];

interface Props {
  value: TiebreakKey[];
  onChange: (v: TiebreakKey[]) => void;
}

/** Clique para incluir/remover um critério; a ordem dos cliques define a prioridade. */
export function TiebreakOrderPicker({ value, onChange }: Props) {
  function toggle(key: TiebreakKey) {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...value];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
          Ordem de desempate
        </label>
        <TiebreakLegendButton variant="link" tiebreakKeys={ALL} />
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((key, i) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 pl-3 pr-1 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
          >
            {i + 1}º {LABELS[key]}
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Subir prioridade de ${LABELS[key]}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-brand-100 dark:hover:bg-brand-900 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === value.length - 1}
              aria-label={`Descer prioridade de ${LABELS[key]}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-brand-100 dark:hover:bg-brand-900 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-label={`Remover ${LABELS[key]}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {ALL.filter((k) => !value.includes(k)).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            + {LABELS[key]}
          </button>
        ))}
      </div>
    </div>
  );
}
