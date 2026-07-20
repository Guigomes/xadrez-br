'use client';

import { useEffect } from 'react';

/**
 * Moldura de impressão: CSS @media print + botão que dispara window.print().
 * Usada pelas páginas /print de pareamentos e classificação (F10).
 */
export function PrintFrame({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => { document.title = title; }, [title]);

  return (
    <div className="print-root">
      <style>{`
        .print-root { max-width: 800px; margin: 0 auto; padding: 24px; color: #111; background: #fff; }
        .print-root h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .print-root h2 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; }
        .print-root table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .print-root th, .print-root td { border: 1px solid #ccc; padding: 4px 8px; text-align: center; }
        .print-root th { background: #f3f3f3; }
        .print-root td.name { text-align: left; }
        .print-root td.pts, .print-root td.result { font-weight: 600; }
        .print-section { break-inside: avoid; }
        .print-toolbar { margin-bottom: 16px; }
        @media print {
          .print-toolbar { display: none; }
          .print-root { padding: 0; max-width: none; }
          @page { margin: 1.5cm; }
        }
      `}</style>
      <div className="print-toolbar">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}
