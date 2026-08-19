'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useSeries, useSeriesScopes, useSeriesStandings, useSeriesBreakdown, useRecalculateSeries,
} from '@/lib/hooks/use-series';
import { Chip } from '@/components/admin/classification-ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { SERIES_ABSOLUTE_SCOPE } from '@/types/database';
import type { SeriesStandingRow } from '@/types/database';

interface Props {
  slug: string;
  /** Admin ganha o botão de recalcular; a tela pública, não. */
  showRecalculate?: boolean;
}

export function SeriesStandingsView({ slug, showRecalculate }: Props) {
  const { data: series, isLoading } = useSeries(slug);
  const { data: scopes } = useSeriesScopes(series?.id);
  const [scope, setScope] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  // Auto-seleciona o primeiro escopo assim que os escopos chegam — get_series_
  // scopes já devolve o absoluto primeiro. Sem isso a tabela nasce vazia
  // esperando um clique que o usuário não sabe que precisa dar.
  useEffect(() => {
    if (!scope && scopes && scopes.length > 0) setScope(scopes[0].scope_key);
  }, [scopes, scope]);

  const { data: rows, isLoading: loadingRows } = useSeriesStandings(series?.id, scope ?? undefined);
  const recalc = useRecalculateSeries(series?.id ?? '');

  if (isLoading || !series) return <PageSpinner />;

  if (!scopes?.length) {
    return (
      <div className="space-y-4">
        {showRecalculate && <RecalcBar recalc={recalc} />}
        <EmptyState
          icon="📊"
          title="Nada calculado ainda"
          description="A classificação aparece quando pelo menos uma etapa da série for encerrada. Torneio em andamento não distribui pontos."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showRecalculate && <RecalcBar recalc={recalc} />}

      <div className="flex flex-wrap gap-1.5">
        {scopes.map((s) => (
          <Chip key={s.scope_key} active={scope === s.scope_key} onClick={() => { setScope(s.scope_key); setOpenPlayer(null); }}>
            {s.scope_key === SERIES_ABSOLUTE_SCOPE ? 'Absoluto' : s.scope_name}
          </Chip>
        ))}
      </div>

      {loadingRows ? (
        <PageSpinner />
      ) : !rows?.length ? (
        <EmptyState icon="📊" title="Nenhum jogador neste ranking" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2">Jogador</th>
                <th className="px-3 py-2 text-right">Pontos</th>
                <th className="px-3 py-2 text-right">Etapas</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">Melhor</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">Xadrez</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PlayerRow
                  key={r.identity_key}
                  row={r}
                  seriesId={series.id}
                  scopeKey={scope!}
                  open={openPlayer === r.identity_key}
                  onToggle={() =>
                    setOpenPlayer(openPlayer === r.identity_key ? null : r.identity_key)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Clique num jogador para ver quanto ele fez em cada etapa. &quot;Xadrez&quot; é a soma dos
        pontos ganhos no tabuleiro, usada só como desempate.
      </p>
    </div>
  );
}

function RecalcBar({ recalc }: { recalc: ReturnType<typeof useRecalculateSeries> }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-800">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Recalcular</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          O cálculo roda sozinho quando uma etapa é encerrada. Use isto depois de corrigir um
          resultado de torneio já encerrado.
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => recalc.mutate()} loading={recalc.isPending}>
        Recalcular
      </Button>
      {recalc.isSuccess && !recalc.isPending && (
        <span className="text-xs font-medium text-green-600 dark:text-green-400">
          ✓ {recalc.data} etapa(s) processada(s)
        </span>
      )}
      {recalc.isError && (
        <span className="text-xs text-red-600 dark:text-red-400">
          {(recalc.error as any)?.message ?? 'Falhou.'}
        </span>
      )}
    </div>
  );
}

function PlayerRow({
  row, seriesId, scopeKey, open, onToggle,
}: {
  row: SeriesStandingRow;
  seriesId: string;
  scopeKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  // Só busca o detalhamento da linha aberta — a tabela pode ter centenas de
  // jogadores e uma consulta por linha seria absurda.
  const { data: breakdown } = useSeriesBreakdown(
    open ? seriesId : undefined,
    open ? row.identity_key : undefined,
    open ? scopeKey : undefined
  );

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
      >
        <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{row.rank}</td>
        <td className="px-3 py-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.full_name}</span>
          {row.state && (
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{row.state}</span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {row.points}
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{row.events}</td>
        <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 sm:table-cell dark:text-gray-400">
          {row.best_place}º
        </td>
        <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 sm:table-cell dark:text-gray-400">
          {row.chess_points}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/60 dark:border-gray-800/60 dark:bg-gray-800/20">
          <td />
          <td colSpan={5} className="px-3 py-2">
            {!breakdown?.length ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Carregando…</p>
            ) : (
              <ul className="space-y-1">
                {breakdown.map((b) => (
                  <li key={b.tournament_id} className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href={`/tournaments/${b.tournament_slug}/standings`}
                      className="text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {b.label || b.tournament_name}
                    </Link>
                    {b.pairing_group_name && (
                      <span className="text-gray-400 dark:text-gray-500">({b.pairing_group_name})</span>
                    )}
                    <span className="text-gray-600 dark:text-gray-400">
                      {b.place}º lugar · <strong>{b.points}</strong> pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
