'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/admin/classification-ui';
import { EmptyState } from '@/components/ui/empty-state';
import type { OfficialRankingTable } from '@/lib/series/official-ranking';

interface Props {
  source: string;
  pageUrl: string | null;
  tables: OfficialRankingTable[];
}

/** "ETP1" → "1ª etapa" (rótulo curto "1ª"); "Final" fica igual. */
function stageLabel(header: string): { short: string; long: string } {
  const m = header.match(/^etp\s*(\d+)$/i) ?? header.match(/^etapa\s*(\d+)$/i);
  if (m) return { short: `${m[1]}ª`, long: `${m[1]}ª etapa` };
  return { short: header, long: header };
}

/**
 * Classificação geral oficial (planilha do organizador), uma aba por categoria.
 * Mostra as colunas como vieram: posição, atleta, escola, município, pontos por
 * etapa, descarte e total — sem recalcular nada.
 */
export function OfficialRankingView({ source, pageUrl, tables }: Props) {
  const [active, setActive] = useState(0);
  const table = tables[active];

  const cols = useMemo(() => {
    const h = table?.headers ?? [];
    const find = (re: RegExp) => h.findIndex((c) => re.test(c));
    const pos = find(/^pos/i);
    const name = find(/^atleta$|^nome$|^jogador$/i);
    const school = find(/escola|projeto|clube/i);
    const city = find(/munic|cidade/i);
    const total = find(/^total/i);
    const discard = find(/^descarte/i);
    const known = new Set([pos, name, school, city, total, discard]);
    const stages = h.map((_, i) => i).filter((i) => !known.has(i));
    return { pos, name, school, city, total, discard, stages };
  }, [table]);

  if (!tables.length) return <EmptyState icon="📊" title="Classificação oficial indisponível" />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Classificação geral oficial publicada pela {source}
        {pageUrl && (
          <>
            {' '}(<a href={pageUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-400">ver no site</a>)
          </>
        )}
        . Pontos por etapa, descarte e total vêm da planilha oficial, atualizada após cada etapa.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {tables.map((t, i) => (
          <Chip key={t.label} active={i === active} onClick={() => setActive(i)}>{t.label}</Chip>
        ))}
      </div>

      {table.error ? (
        <EmptyState icon="⚠️" title={table.error} description="Tente de novo em alguns minutos." />
      ) : !table.rows.length ? (
        <EmptyState icon="📊" title="Ninguém pontuou nesta categoria ainda" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="w-10 py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">#</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Atleta</th>
                {cols.stages.map((i) => (
                  <th key={i} title={stageLabel(table.headers[i]).long} className="hidden py-3 px-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 sm:table-cell">
                    {stageLabel(table.headers[i]).short}
                  </th>
                ))}
                {cols.discard >= 0 && (
                  <th className="hidden py-3 px-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 sm:table-cell">Descarte</th>
                )}
                <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => {
                const stagePoints = cols.stages.map((i) => r[i] || '–');
                return (
                  <tr key={ri} className="border-b border-gray-100 dark:border-gray-800/60">
                    <td className="py-3 px-3 align-top tabular-nums text-gray-500 dark:text-gray-400">{cols.pos >= 0 ? r[cols.pos] : ri + 1}</td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{r[cols.name]}</span>
                      <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">
                        {[cols.school >= 0 ? r[cols.school] : '', cols.city >= 0 ? r[cols.city] : ''].filter(Boolean).join(' · ')}
                      </span>
                      {/* No celular as colunas de etapa somem: os pontos viram uma linha. */}
                      <span className="mt-0.5 block text-xs tabular-nums text-gray-500 dark:text-gray-400 sm:hidden">
                        {cols.stages.map((i, k) => `${stageLabel(table.headers[i]).short} ${stagePoints[k]}`).join(' · ')}
                        {cols.discard >= 0 && r[cols.discard] && r[cols.discard] !== '0' ? ` · descarte ${r[cols.discard]}` : ''}
                      </span>
                    </td>
                    {cols.stages.map((i, k) => (
                      <td key={i} className="hidden py-3 px-2 text-center tabular-nums text-gray-600 dark:text-gray-400 sm:table-cell">{stagePoints[k]}</td>
                    ))}
                    {cols.discard >= 0 && (
                      <td className="hidden py-3 px-2 text-center tabular-nums text-gray-500 dark:text-gray-400 sm:table-cell">{r[cols.discard] || '–'}</td>
                    )}
                    <td className="py-3 px-3 text-center font-bold tabular-nums text-gray-900 dark:text-gray-100">{cols.total >= 0 ? r[cols.total] : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
