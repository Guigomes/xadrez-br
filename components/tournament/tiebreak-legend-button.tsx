'use client';

import React from 'react';
import { TIEBREAK_INFO } from '@/lib/utils/chess';

const TIEBREAKS = [
  { n: 1, info: TIEBREAK_INFO.buchholz },
  { n: 2, info: TIEBREAK_INFO.buchholz_cut1 },
  { n: 3, info: TIEBREAK_INFO.sonneborn_berger },
] as const;

export function TiebreakLegendButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-gray-400 border border-gray-300 dark:border-gray-600 hover:text-gray-600 dark:hover:text-gray-200 hover:border-gray-400 dark:hover:border-gray-400 leading-none shrink-0 transition-colors"
        aria-label="Ver critérios de desempate"
      >
        ?
      </button>
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
              {TIEBREAKS.map(({ n, info }) => (
                <div key={info.short}>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Desempate {n} – {info.label}{' '}
                    <span className="text-xs font-normal text-gray-400">({info.short})</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{info.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
