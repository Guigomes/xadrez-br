'use client';

import Link from 'next/link';
import { Tooltip } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { formatScore, formatTiebreak, TIEBREAK_INFO } from '@/lib/utils/chess';
import type { StandingRow } from '@/types/database';

interface StandingsTableProps {
  standings: StandingRow[];
  tournamentSlug: string;
}

export function StandingsTable({ standings, tournamentSlug }: StandingsTableProps) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      {/* Desktop table */}
      <table className="hidden sm:table min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800">
            <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 w-10">#</th>
            <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Jogador</th>
            <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Pts</th>
            <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
              <Tooltip content={TIEBREAK_INFO.buchholz.description}>
                <span className="cursor-help border-b border-dashed border-gray-400">{TIEBREAK_INFO.buchholz.short}</span>
              </Tooltip>
            </th>
            <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
              <Tooltip content={TIEBREAK_INFO.buchholz_cut1.description}>
                <span className="cursor-help border-b border-dashed border-gray-400">{TIEBREAK_INFO.buchholz_cut1.short}</span>
              </Tooltip>
            </th>
            <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
              <Tooltip content={TIEBREAK_INFO.sonneborn_berger.description}>
                <span className="cursor-help border-b border-dashed border-gray-400">{TIEBREAK_INFO.sonneborn_berger.short}</span>
              </Tooltip>
            </th>
            <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Rating</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr
              key={row.tp_id}
              className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
            >
              <td className="py-3 px-3">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold
                  ${row.rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                  ${row.rank === 2 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : ''}
                  ${row.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                  ${(row.rank ?? 0) > 3 ? 'text-gray-500 dark:text-gray-400' : ''}
                `}>
                  {row.rank ?? '–'}
                </span>
              </td>
              <td className="py-3 px-3">
                <Link
                  href={`/tournaments/${tournamentSlug}/players/${row.tp_id}`}
                  className="font-medium text-gray-900 dark:text-gray-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  {row.full_name}
                </Link>
                {row.category_name && (
                  <span className="ml-2 text-xs text-gray-400">{row.category_name}</span>
                )}
              </td>
              <td className="py-3 px-3 text-center font-bold text-gray-900 dark:text-gray-100">
                {formatScore(row.points)}
              </td>
              <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums">
                {formatTiebreak(row.buchholz)}
              </td>
              <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums">
                {formatTiebreak(row.buchholz_cut1)}
              </td>
              <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 tabular-nums">
                {formatTiebreak(row.sonneborn_berger)}
              </td>
              <td className="py-3 px-3 text-center text-gray-500 dark:text-gray-400">
                {row.rating_std ?? '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800/60">
        {standings.map((row) => (
          <Link
            key={row.tp_id}
            href={`/tournaments/${tournamentSlug}/players/${row.tp_id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
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
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{row.full_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                BH: {formatTiebreak(row.buchholz)} · SB: {formatTiebreak(row.sonneborn_berger)}
                {row.rating_std && ` · ${row.rating_std}`}
              </p>
            </div>
            <span className="text-xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">
              {formatScore(row.points)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
