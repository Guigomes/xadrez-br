'use client';

import React from 'react';
import { TIEBREAK_INFO } from '@/lib/utils/chess';
import type { TiebreakKey } from '@/types/database';

const DEFAULT_KEYS: TiebreakKey[] = ['buchholz', 'buchholz_cut1', 'sonneborn_berger'];

interface Props {
  /** 'icon' (padrão) pra espaço apertado (cabeçalho de tabela); 'link' pra texto legível onde há espaço. */
  variant?: 'icon' | 'link';
  /** Quais critérios listar na legenda. Padrão: os 3 usados quando o torneio não configura ordem própria. */
  tiebreakKeys?: TiebreakKey[];
}

export function TiebreakLegendButton({ variant = 'icon', tiebreakKeys = DEFAULT_KEYS }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {variant === 'link' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline shrink-0"
        >
          Dúvidas sobre o desempate?
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-gray-400 border border-gray-300 dark:border-gray-600 hover:text-gray-600 dark:hover:text-gray-200 hover:border-gray-400 dark:hover:border-gray-400 leading-none shrink-0 transition-colors"
          aria-label="Ver critérios de desempate"
        >
          ?
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Critérios de desempate</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none transition-colors"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {tiebreakKeys.map((key, i) => {
                const info = TIEBREAK_INFO[key];
                return (
                  <div key={key}>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Desempate {i + 1} – {info.label}{' '}
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
    </>
  );
}
