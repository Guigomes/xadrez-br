'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTournament, useTournamentStandings, usePlayerHistory } from '@/lib/hooks/use-tournament';
import { usePlayerFollow } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
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

  // Fallback: fetch basic player info directly when standings don't exist yet
  const { data: tpBasic, isLoading: loadingTpBasic } = useQuery({
    queryKey: ['tp-basic', tpId],
    enabled: !loadingStandings && !playerRow,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tournament_players')
        .select('player_id, initial_ranking, players(full_name, rating_std, state), tournament_categories(name)')
        .eq('id', tpId)
        .single();
      return data;
    },
    staleTime: Infinity,
  });

  const playerId = playerRow?.player_id ?? (tpBasic?.player_id as string | undefined);
  const { data: history, isLoading: loadingHistory } = usePlayerHistory(tournament?.id ?? '', tpId);
  const { isFollowing, toggleFollow, user } = usePlayerFollow(playerId ?? '', tournament?.id);

  const { data: playerProfile } = useQuery({
    queryKey: ['player-profile', playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('players')
        .select('fide_id, cbx_id')
        .eq('id', playerId!)
        .single();
      return data;
    },
    staleTime: Infinity,
  });

  if (!tournament || loadingStandings || (!playerRow && loadingTpBasic)) return <PageSpinner />;

  // Build a display object from standings (if available) or fallback to tp basic info
  const tp = tpBasic as { player_id: string; initial_ranking: number | null; players: { full_name: string; rating_std: number | null; state: string | null } | null; tournament_categories: { name: string } | null } | null | undefined;
  const displayName = playerRow?.full_name ?? (tp?.players as { full_name: string } | null)?.full_name ?? '';
  const displayRating = playerRow?.rating_std ?? (tp?.players as { rating_std: number | null } | null)?.rating_std ?? null;
  const displayState = playerRow?.state ?? (tp?.players as { state: string | null } | null)?.state ?? null;
  const displayCategory = playerRow?.category_name ?? (tp?.tournament_categories as { name: string } | null)?.name ?? null;
  const displayRank = playerRow?.rank ?? null;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Player header */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
                ${displayRank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                ${displayRank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : ''}
                ${displayRank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                ${(displayRank ?? 0) > 3 ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : ''}
                ${displayRank === null ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : ''}
              `}>
                {displayRank ?? '–'}
              </span>
              {standings?.length ? <span className="text-xs text-gray-400">de {standings.length}</span> : null}
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{displayName}</h1>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {displayState && <span className="text-xs text-gray-500">{displayState}</span>}
              {displayRating && (
                <span className="text-xs text-gray-500">Rating {displayRating}</span>
              )}
              {displayCategory && (
                <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 text-xs">
                  {displayCategory}
                </Badge>
              )}
            </div>
            {(playerProfile?.fide_id || playerProfile?.cbx_id) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                {playerProfile.fide_id && (
                  <a
                    href={`https://ratings.fide.com/profile/${playerProfile.fide_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    FIDE #{playerProfile.fide_id}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                )}
                {playerProfile.cbx_id && (
                  <a
                    href={`https://www.cbx.org.br/enxadristas/?id=${playerProfile.cbx_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    CBX #{playerProfile.cbx_id}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                )}
              </div>
            )}
          </div>
          {playerRow && (
            <div className="flex flex-col items-end gap-2">
              <span className="text-3xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                {formatScore(playerRow.points)}
              </span>
              <span className="text-xs text-gray-400">pontos</span>
            </div>
          )}
        </div>

        {/* Stats row — only when standings exist */}
        {playerRow && (
          <>
            <div className="grid grid-cols-3 gap-3 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{playerRow.wins ?? 0}</p>
                <p className="text-xs text-gray-500">Vitórias</p>
              </div>
              <div>
                <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{playerRow.draws ?? 0}</p>
                <p className="text-xs text-gray-500">Empates</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-500 dark:text-red-400">{playerRow.losses ?? 0}</p>
                <p className="text-xs text-gray-500">Derrotas</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <TiebreakRow info={TIEBREAK_INFO.buchholz} value={formatTiebreak(playerRow.buchholz)} />
              <TiebreakRow info={TIEBREAK_INFO.buchholz_cut1} value={formatTiebreak(playerRow.buchholz_cut1)} />
              <TiebreakRow info={TIEBREAK_INFO.sonneborn_berger} value={formatTiebreak(playerRow.sonneborn_berger)} />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-3">
          <ShareButton title={`${displayName} – ${tournament.name}`} />
          <Button
            variant={isFollowing ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => toggleFollow.mutate()}
            loading={toggleFollow.isPending}
          >
            {isFollowing ? '★ Seguindo' : '☆ Acompanhar'}
          </Button>
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

function TiebreakRow({ info, value }: { info: { label: string; short: string; description: string }; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 shrink-0 text-right">
        <span className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</span>
        <span className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">{info.short}</span>
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-tight">{info.label}</span>
    </div>
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
      <span className="text-xs font-bold text-gray-400 dark:text-gray-500 shrink-0">
        Rodada {row.round_number}
      </span>

      {/* Color indicator */}
      {isWhite ? (
        <svg className="h-4 w-3 shrink-0" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg" title="Brancas">
          <circle cx="10" cy="5.5" r="4" fill="white" stroke="#9ca3af" strokeWidth="1.5" />
          <path d="M7 10.5C7 10.5 5.5 13 5 15H15C14.5 13 13 10.5 13 10.5C12 10 11 9.5 10 9.5C9 9.5 8 10 7 10.5Z" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M3 24H17L15 17H5L3 24Z" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="h-4 w-3 shrink-0" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg" title="Pretas">
          <circle cx="10" cy="5.5" r="4" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" />
          <path d="M7 10.5C7 10.5 5.5 13 5 15H15C14.5 13 13 10.5 13 10.5C12 10 11 9.5 10 9.5C9 9.5 8 10 7 10.5Z" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M3 24H17L15 17H5L3 24Z" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}

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
