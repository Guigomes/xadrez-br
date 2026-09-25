'use client';

import React from 'react';
import { Link } from '@/i18n/navigation';
import { TiebreakLegendButton } from '@/components/tournament/tiebreak-legend-button';
import { StateBadge } from '@/components/player/state-badge';
import { formatScore, formatTiebreak } from '@/lib/utils/chess';
import type { StandingRow } from '@/types/database';

interface StandingsTableProps {
  standings: StandingRow[];
  tournamentSlug: string;
  followedPlayerIds?: Set<string>;
  isInitialRanking?: boolean;
}

export function StandingsTable({ standings, tournamentSlug, followedPlayerIds, isInitialRanking = false }: StandingsTableProps) {
  const hasFollowed = !!followedPlayerIds?.size;

  const followed = hasFollowed ? standings.filter((r) => followedPlayerIds!.has(r.player_id)) : [];
  const rest     = hasFollowed ? standings.filter((r) => !followedPlayerIds!.has(r.player_id)) : standings;

  function RankBadge({ rank }: { rank: number | null }) {
    return (
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold
        ${!isInitialRanking && rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
        ${!isInitialRanking && rank === 2 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : ''}
        ${!isInitialRanking && rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
        ${isInitialRanking || rank === null || (rank ?? 0) > 3 ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : ''}
      `}>
        {rank ?? '–'}
      </span>
    );
  }

  /** Uma linha serve os dois tamanhos de tela. Antes havia DesktopRow e
   *  MobileRow renderizando o MESMO jogador duas vezes no HTML (tabela
   *  `hidden sm:table` + lista `sm:hidden`), o que dobrava o custo de render
   *  numa das telas mais pesadas do app. Agora as colunas de desempate somem
   *  no mobile e viram uma sub-linha dentro da célula do nome. */
  function Row({ row, highlighted }: { row: StandingRow; highlighted?: boolean }) {
    return (
      <tr className={`border-b border-gray-100 dark:border-gray-800/60 transition-colors
        ${highlighted
          ? 'bg-brand-50 dark:bg-brand-950/20 hover:bg-brand-100 dark:hover:bg-brand-950/30'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
        }`}
      >
        <td className="py-3 px-3"><RankBadge rank={row.rank} /></td>
        <td className="py-3 px-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {highlighted && <span className="text-brand-500" title="Acompanhando">★</span>}
            <Link
              href={`/torneios/${tournamentSlug}/players/${row.tp_id}${row.pairing_group_id ? `?group=${row.pairing_group_id}` : ''}`}
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {row.title && <span className="text-gray-400 dark:text-gray-500 font-normal">{row.title} </span>}
              {row.full_name}
            </Link>
            <StateBadge state={row.state} />
            {row.category_name && <span className="text-xs text-gray-400">{row.category_name}</span>}
          </div>
          <p className="mt-0.5 text-xs text-gray-400 sm:hidden">
            {isInitialRanking
              ? (row.rating_std ? `Rating ${row.rating_std}` : 'Sem rating informado')
              : `BH: ${formatTiebreak(row.buchholz)} · BH-1: ${formatTiebreak(row.buchholz_cut1)} · SB: ${formatTiebreak(row.sonneborn_berger)}${row.rating_std ? ` · Rating ${row.rating_std}` : ''}`}
          </p>
        </td>
        {!isInitialRanking && <td className="py-3 px-3 text-center font-bold text-gray-900 dark:text-gray-100">{formatScore(row.points)}</td>}
        {!isInitialRanking && <td className="hidden py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums sm:table-cell">{formatTiebreak(row.buchholz)}</td>}
        {!isInitialRanking && <td className="hidden py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums sm:table-cell">{formatTiebreak(row.buchholz_cut1)}</td>}
        {!isInitialRanking && <td className="hidden py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums sm:table-cell">{formatTiebreak(row.sonneborn_berger)}</td>}
        <td className="hidden py-3 px-3 text-center text-gray-500 dark:text-gray-400 sm:table-cell">{row.rating_std ?? '–'}</td>
      </tr>
    );
  }

  const thead = (
    <thead>
      <tr className="border-b border-gray-200 dark:border-gray-800">
        <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-10">#</th>
        <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
        {!isInitialRanking && <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Pts</th>}
        {!isInitialRanking && <th className="hidden py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 sm:table-cell">BH</th>}
        {!isInitialRanking && <th className="hidden py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 sm:table-cell">BH-1</th>}
        {!isInitialRanking && (
          <th className="hidden py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 sm:table-cell">
            <span className="inline-flex items-center gap-1">SB <TiebreakLegendButton /></span>
          </th>
        )}
        <th className="hidden py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 sm:table-cell">Rating</th>
      </tr>
    </thead>
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        {thead}
        <tbody>
          {followed.map((row) => <Row key={row.tp_id} row={row} highlighted />)}
          {hasFollowed && followed.length > 0 && rest.length > 0 && (
            <tr><td colSpan={isInitialRanking ? 3 : 7} className="py-3 bg-gray-50 dark:bg-gray-900/50">
              <div className="border-t-2 border-dashed border-gray-300 dark:border-gray-700 mx-2" />
            </td></tr>
          )}
          {rest.map((row) => <Row key={row.tp_id} row={row} />)}
        </tbody>
      </table>
    </div>
  );
}
