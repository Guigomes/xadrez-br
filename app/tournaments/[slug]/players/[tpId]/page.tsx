'use client';

import { use } from 'react';
import Link from 'next/link';
import { useTournament, useTournamentStandings, usePlayerHistory } from '@/lib/hooks/use-tournament';
import { usePlayerFollow } from '@/lib/hooks/use-auth';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { formatScore, formatTiebreak, resultBadgeColor, resultLabel, TIEBREAK_INFO } from '@/lib/utils/chess';
import type { PlayerHistoryRow } from '@/types/database';

interface Props {
  params: Promise<{ slug: string; tpId: string }>;
}

export default function PlayerTournamentPage({ params }: Props) {
  const { slug, tpId } = use(params);
  const { data: tournament } = useTournament(slug);
  const { data: standings, isLoading: loadingStandings } = useTournamentStandings(tournament?.id ?? '');
  const playerRow = standings?.find((s) => s.tp_id === tpId);
  const { data: history, isLoading: loadingHistory } = usePlayerHistory(tournament?.id ?? '', tpId);
  const { isFollowing, toggleFollow, user } = usePlayerFollow(playerRow?.player_id ?? '', tournament?.id);

  if (loadingStandings || !tournament || !playerRow) return <PageSpinner />;

  const w = playerRow.wins ?? 0;
  const d = playerRow.draws ?? 0;
  const l = playerRow.losses ?? 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Player header */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
                ${playerRow.rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                ${playerRow.rank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : ''}
                ${playerRow.rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                ${(playerRow.rank ?? 0) > 3 ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : ''}
              `}>
                {playerRow.rank ?? '–'}
              </span>
              <span className="text-xs text-gray-400">de {standings?.length}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{playerRow.full_name}</h1>
            <div className="flex flex-wrap gap-2 mt-1">
              {playerRow.state && <span className="text-xs text-gray-500">{playerRow.state}</span>}
              {playerRow.rating_std && (
                <span className="text-xs text-gray-500">Rating {playerRow.rating_std}</span>
              )}
              {playerRow.category_name && (
                <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 text-xs">
                  {playerRow.category_name}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-3xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">
              {formatScore(playerRow.points)}
            </span>
            <span className="text-xs text-gray-400">pontos</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
          <div>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{w}</p>
            <p className="text-xs text-gray-500">Vitórias</p>
          </div>
          <div>
            <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{d}</p>
            <p className="text-xs text-gray-500">Empates</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-500 dark:text-red-400">{l}</p>
            <p className="text-xs text-gray-500">Derrotas</p>
          </div>
        </div>

        {/* Tiebreaks */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <TiebreakCell label={TIEBREAK_INFO.buchholz.label} short={TIEBREAK_INFO.buchholz.short} value={formatTiebreak(playerRow.buchholz)} desc={TIEBREAK_INFO.buchholz.description} />
          <TiebreakCell label={TIEBREAK_INFO.buchholz_cut1.label} short={TIEBREAK_INFO.buchholz_cut1.short} value={formatTiebreak(playerRow.buchholz_cut1)} desc={TIEBREAK_INFO.buchholz_cut1.description} />
          <TiebreakCell label={TIEBREAK_INFO.sonneborn_berger.label} short={TIEBREAK_INFO.sonneborn_berger.short} value={formatTiebreak(playerRow.sonneborn_berger)} desc={TIEBREAK_INFO.sonneborn_berger.description} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-3">
          <ShareButton title={`${playerRow.full_name} – ${tournament.name}`} />
          {user ? (
            <Button
              variant={isFollowing ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => toggleFollow.mutate()}
              loading={toggleFollow.isPending}
            >
              {isFollowing ? '★ Seguindo' : '☆ Acompanhar'}
            </Button>
          ) : (
            <Link href="/login">
              <Button variant="secondary" size="sm">☆ Acompanhar</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Round history */}
      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Histórico de rodadas</h2>
        </div>
        {loadingHistory ? (
          <div className="py-8 flex justify-center"><PageSpinner /></div>
        ) : (history?.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Nenhuma partida disputada ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {(history as PlayerHistoryRow[]).map((row) => (
              <HistoryRow key={row.round_number} row={row} tournamentSlug={slug} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TiebreakCell({ label, short, value, desc }: { label: string; short: string; value: string; desc: string }) {
  return (
    <Tooltip content={desc}>
      <div className="text-center cursor-help">
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
        <p className="text-xs text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-600 inline-block">{short}</p>
      </div>
    </Tooltip>
  );
}

function HistoryRow({ row, tournamentSlug }: { row: PlayerHistoryRow; tournamentSlug: string }) {
  const isWhite = row.color === 'white';
  const isDone = row.round_status === 'finished' && row.result !== '*';

  return (
    <Link
      href={`/tournaments/${tournamentSlug}/rounds/${row.round_number}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
    >
      {/* Round number */}
      <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center shrink-0">
        R{row.round_number}
      </span>

      {/* Color indicator */}
      <span
        className={`h-4 w-4 rounded-full border shrink-0 ${isWhite ? 'bg-white border-gray-400' : 'bg-gray-800 border-gray-600'}`}
        title={isWhite ? 'Brancas' : 'Pretas'}
      />

      {/* Opponent */}
      <div className="flex-1 min-w-0">
        {row.is_bye ? (
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">BYE</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {row.opponent_name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {row.opponent_rating ? `Rating ${row.opponent_rating}` : 'Sem rating'}
              {row.opponent_rank ? ` · ${row.opponent_rank}º colocado` : ''}
            </p>
          </>
        )}
      </div>

      {/* Result + cumulative */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {isDone ? (
          <Badge className={resultBadgeColor(row.result, isWhite)}>
            {resultLabel(row.result, isWhite)}
          </Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {row.round_status === 'ongoing' ? 'Em andamento' : 'Aguardando'}
          </Badge>
        )}
        {row.cumulative_pts !== null && (
          <span className="text-xs text-gray-400 tabular-nums">
            {formatScore(row.cumulative_pts)} pts
          </span>
        )}
      </div>
    </Link>
  );
}
