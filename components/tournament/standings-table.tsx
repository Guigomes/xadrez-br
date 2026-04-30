'use client';

import React from 'react';
import Link from 'next/link';
import { TiebreakLegendButton } from '@/components/tournament/tiebreak-legend-button';
import { formatScore, formatTiebreak } from '@/lib/utils/chess';
import type { StandingRow } from '@/types/database';

interface StandingsTableProps {
  standings: StandingRow[];
  tournamentSlug: string;
  followedPlayerIds?: Set<string>;
}

export function StandingsTable({ standings, tournamentSlug, followedPlayerIds }: StandingsTableProps) {
  const hasFollowed = !!followedPlayerIds?.size;

  const followed = hasFollowed ? standings.filter((r) => followedPlayerIds!.has(r.player_id)) : [];
  const rest     = hasFollowed ? standings.filter((r) => !followedPlayerIds!.has(r.player_id)) : standings;

  function RankBadge({ rank }: { rank: number | null }) {
    return (
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold
        ${rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
        ${rank === 2 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : ''}
        ${rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
        ${(rank ?? 0) > 3 ? 'text-gray-500 dark:text-gray-400' : ''}
      `}>
        {rank ?? '–'}
      </span>
    );
  }

  function DesktopRow({ row, highlighted }: { row: StandingRow; highlighted?: boolean }) {
    return (
      <tr className={`border-b border-gray-100 dark:border-gray-800/60 transition-colors
        ${highlighted
          ? 'bg-brand-50 dark:bg-brand-950/20 hover:bg-brand-100 dark:hover:bg-brand-950/30'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
        }`}
      >
        <td className="py-3 px-3"><RankBadge rank={row.rank} /></td>
        <td className="py-3 px-3">
          <div className="flex items-center gap-1.5">
            {highlighted && <span className="text-brand-500" title="Acompanhando">★</span>}
            <Link
              href={`/tournaments/${tournamentSlug}/players/${row.tp_id}`}
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {row.full_name}
            </Link>
            {row.category_name && (
              <span className="ml-1 text-xs text-gray-400">{row.category_name}</span>
            )}
          </div>
        </td>
        <td className="py-3 px-3 text-center font-bold text-gray-900 dark:text-gray-100">{formatScore(row.points)}</td>
        <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums">{formatTiebreak(row.buchholz)}</td>
        <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums">{formatTiebreak(row.buchholz_cut1)}</td>
        <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums">{formatTiebreak(row.sonneborn_berger)}</td>
        <td className="py-3 px-3 text-center text-gray-500 dark:text-gray-400">{row.rating_std ?? '–'}</td>
      </tr>
    );
  }

  function MobileRow({ row, highlighted }: { row: StandingRow; highlighted?: boolean }) {
    return (
      <Link
        href={`/tournaments/${tournamentSlug}/players/${row.tp_id}`}
        className={`flex items-center gap-3 px-4 py-3 transition-colors
          ${highlighted
            ? 'bg-brand-50 dark:bg-brand-950/20 hover:bg-brand-100 dark:hover:bg-brand-950/30'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
          }`}
      >
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold
          ${row.rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
          ${row.rank === 2 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : ''}
          ${row.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
          ${(row.rank ?? 0) > 3 ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : ''}
        `}>
          {row.rank ?? '–'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {highlighted && <span className="text-brand-500 text-xs">★</span>}
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{row.full_name}</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            BH: {formatTiebreak(row.buchholz)} · BH-1: {formatTiebreak(row.buchholz_cut1)} · SB: {formatTiebreak(row.sonneborn_berger)}
            {row.rating_std && ` · ${row.rating_std}`}
          </p>
        </div>
        <span className="text-xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">
          {formatScore(row.points)}
        </span>
      </Link>
    );
  }

  const thead = (
    <thead>
      <tr className="border-b border-gray-200 dark:border-gray-800">
        <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-10">#</th>
        <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
        <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Pts</th>
        <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">D1</th>
        <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">D2</th>
        <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">D3 <TiebreakLegendButton /></span>
        </th>
        <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Rating</th>
      </tr>
    </thead>
  );

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      {/* Desktop */}
      <table className="hidden sm:table min-w-full text-sm">
        {thead}
        <tbody>
          {followed.map((row) => <DesktopRow key={row.tp_id} row={row} highlighted />)}
          {hasFollowed && followed.length > 0 && rest.length > 0 && (
            <tr><td colSpan={7} className="py-3 bg-gray-50 dark:bg-gray-900/50">
              <div className="border-t-2 border-dashed border-gray-300 dark:border-gray-700 mx-2" />
            </td></tr>
          )}
          {rest.map((row) => <DesktopRow key={row.tp_id} row={row} />)}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800/60">
        {followed.map((row) => <MobileRow key={row.tp_id} row={row} highlighted />)}
        {hasFollowed && followed.length > 0 && rest.length > 0 && (
          <div className="py-3 bg-gray-50 dark:bg-gray-900/50">
            <div className="border-t-2 border-dashed border-gray-300 dark:border-gray-700 mx-3" />
          </div>
        )}
        {rest.map((row) => <MobileRow key={row.tp_id} row={row} />)}
      </div>
    </div>
  );
}
