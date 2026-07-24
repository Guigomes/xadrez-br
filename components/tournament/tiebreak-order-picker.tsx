'use client';

import { useState } from 'react';
import type { TiebreakKey } from '@/types/database';
import { TIEBREAK_INFO } from '@/lib/utils/chess';

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
  const [infoOpen, setInfoOpen] = useState(false);

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
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
          Ordem de desempate
        </label>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-gray-400 border border-gray-300 dark:border-gray-600 hover:text-gray-600 dark:hover:text-gray-200 hover:border-gray-400 dark:hover:border-gray-400 leading-none shrink-0 transition-colors"
          aria-label="O que é cada critério de desempate"
        >
          i
        </button>
      </div>
      {infoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0"
          onClick={() => setInfoOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Critérios de desempate</p>
              <button
                type="button"
                onClick={() => setInfoOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none transition-colors"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {ALL.map((key) => {
                const info = TIEBREAK_INFO[key];
                return (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {info.label}{' '}
                      <span className="text-xs font-normal text-gray-400">({info.short})</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{info.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {value.map((key, i) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 pl-3 pr-1.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300"
          >
            {i + 1}º {LABELS[key]}
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
              className="disabled:opacity-30 px-0.5">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1}
              className="disabled:opacity-30 px-0.5">↓</button>
            <button type="button" onClick={() => toggle(key)} className="px-0.5 hover:text-red-500">✕</button>
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
