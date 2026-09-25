'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTournament, useTournamentStandings, usePlayerHistory } from '@/lib/hooks/use-tournament';
import { usePlayerFollow } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import { Button } from '@/components/ui/button';
import { StateBadge } from '@/components/player/state-badge';
import { formatScore, formatTiebreak, resultBadgeColor, resultLabel, TIEBREAK_INFO } from '@/lib/utils/chess';
import { getTournamentStartLabel } from '@/lib/utils/date';
import type { PlayerHistoryRow } from '@/types/database';

interface Props {
  params: Promise<{ slug: string; tpId: string }>;
}

export default function PlayerTournamentPage({ params }: Props) {
  const { slug, tpId } = use(params);
  const searchParams = useSearchParams();
  const { data: tournament } = useTournament(slug);
  const { data: standings, isLoading: loadingStandings } = useTournamentStandings(tournament?.id ?? '');
  const playerRow = standings?.find((s) => s.tp_id === tpId);

  // A ficha precisa de cidade, UF, escola e grupo mesmo quando a classificação
  // já existe; por isso o cadastro básico é sempre lido, não só como fallback.
  const { data: tpBasic, isLoading: loadingTpBasic } = useQuery({
    queryKey: ['tp-basic', tpId],
    enabled: !!tpId,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('tournament_players')
        .select('player_id, initial_ranking, pairing_group_id, player:players(full_name, title, rating_std, state, city, club_or_school, fide_id, cbx_id), category:tournament_categories(name), pairing_group:pairing_groups(name)')
        .eq('id', tpId)
        .single();
      return data;
    },
    staleTime: Infinity,
  });

  const playerId = playerRow?.player_id ?? (tpBasic?.player_id as string | undefined);
  const { data: history, isLoading: loadingHistory } = usePlayerHistory(tournament?.id ?? '', tpId);
  const { isFollowing, toggleFollow } = usePlayerFollow(playerId ?? '', tournament?.id);

  // Block only until we have a name to show. Stats section handles its own skeleton.
  if (!tournament || loadingTpBasic) return <PageSpinner />;

  // Build a display object from standings (if available) or fallback to tp basic info
  const tp = tpBasic as {
    player_id: string;
    initial_ranking: number | null;
    pairing_group_id: string | null;
    player: { full_name: string; title: string | null; rating_std: number | null; state: string | null; city: string | null; club_or_school: string | null; fide_id: string | null; cbx_id: string | null } | null;
    category: { name: string } | null;
    pairing_group: { name: string } | null;
  } | null | undefined;
  const profile = tp?.player;
  const displayName = playerRow?.full_name ?? profile?.full_name ?? '';
  const displayTitle = playerRow?.title ?? profile?.title ?? null;
  const displayRating = playerRow?.rating_std ?? profile?.rating_std ?? null;
  const displayState = playerRow?.state ?? profile?.state ?? null;
  const displayCategory = playerRow?.category_name ?? tp?.category?.name ?? null;
  const displayGroupId = playerRow?.pairing_group_id ?? tp?.pairing_group_id ?? null;
  const displayGroupName = playerRow?.pairing_group_name ?? tp?.pairing_group?.name ?? null;
  const hasPlayed = (playerRow?.games_played ?? 0) > 0 || (history as PlayerHistoryRow[] | undefined)?.some((row) => row.result !== '*') === true;
  const displayRank = hasPlayed
    ? (playerRow?.rank ?? null)
    : (playerRow?.initial_ranking ?? tp?.initial_ranking ?? null);
  const groupSize = standings
    ? standings.filter((row) => displayGroupId ? row.pairing_group_id === displayGroupId : !row.pairing_group_id).length
    : null;
  const contextGroupId = searchParams.get('group') ?? displayGroupId;
  const backHref = `/torneios/${slug}/participants${contextGroupId ? `?group=${contextGroupId}` : ''}`;
  const startLabel = !hasPlayed && !['cancelled', 'finished'].includes(tournament.status)
    ? getTournamentStartLabel(tournament.start_date)
    : null;
  const displayClub = profile?.club_or_school
    ?? (tournament.mode === 'imported' ? profile?.city : null);
  const displayCity = tournament.mode === 'imported'
    && displayClub?.trim().toLocaleLowerCase('pt-BR') === profile?.city?.trim().toLocaleLowerCase('pt-BR')
    ? null
    : profile?.city;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
        ← {displayGroupName ?? 'Participantes'}
      </Link>
      {/* Player header */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold
                ${hasPlayed && displayRank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                ${hasPlayed && displayRank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : ''}
                ${hasPlayed && displayRank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                ${!hasPlayed || displayRank === null || (displayRank ?? 0) > 3 ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : ''}
              `}>
                {displayRank ?? '–'}
              </span>
              {groupSize ? (
                <span className="text-xs text-gray-400">
                  {hasPlayed ? 'de' : 'posição inicial de'} {groupSize}{displayGroupName ? ` · ${displayGroupName}` : ''}
                </span>
              ) : null}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {displayTitle && <span className="text-gray-400 dark:text-gray-500 font-normal">{displayTitle} </span>}
              {displayName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StateBadge state={displayState} className="text-xs" />
              {displayCity && <span className="text-xs text-gray-500 dark:text-gray-400">{displayCity}</span>}
              {displayRating && (
                <span className="text-xs text-gray-500">Rating {displayRating}</span>
              )}
              {displayGroupName && <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs">{displayGroupName}</Badge>}
              {displayCategory && (
                <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 text-xs">
                  {displayCategory}
                </Badge>
              )}
            </div>
            {displayClub && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Escola/Clube: <span className="font-medium text-gray-800 dark:text-gray-200">{displayClub}</span></p>
            )}
            {(profile?.fide_id || profile?.cbx_id) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                {profile.fide_id && (
                  <a
                    href={`https://ratings.fide.com/profile/${profile.fide_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    FIDE #{profile.fide_id}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                )}
                {profile.cbx_id && (
                  <a
                    href={`https://www.cbx.org.br/enxadristas/?id=${profile.cbx_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    CBX #{profile.cbx_id}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                )}
              </div>
            )}
          </div>
          {playerRow && hasPlayed ? (
            <div className="flex flex-col items-end gap-2">
              <span className="text-3xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                {formatScore(playerRow.points)}
              </span>
              <span className="text-xs text-gray-400">pontos</span>
            </div>
          ) : loadingStandings ? (
            <div className="flex flex-col items-end gap-2 animate-pulse">
              <div className="h-9 w-10 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-10 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ) : null}
        </div>

        {/* Stats row — skeleton while standings load, real data once available */}
        {loadingStandings && !playerRow ? (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 animate-pulse">
            <div className="grid grid-cols-3 gap-3 pb-3 text-center">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-6 w-8 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-12 rounded bg-gray-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-gray-100 dark:border-gray-800 pt-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-12 h-8 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                  <div className="h-4 w-32 rounded bg-gray-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
          </div>
        ) : playerRow && hasPlayed ? (() => {
          // Derive wins/draws/losses from history instead of stale recalculation data
          const finishedGames = (history as PlayerHistoryRow[] | undefined)?.filter(
            (r) => r.result !== '*' && !r.is_bye,
          ) ?? [];
          const wins   = finishedGames.filter((r) =>
            (r.result === '1-0' && r.color === 'white') ||
            (r.result === '0-1' && r.color === 'black'),
          ).length;
          const draws  = finishedGames.filter((r) => r.result === '1/2-1/2').length;
          const losses = finishedGames.filter((r) =>
            (r.result === '1-0' && r.color === 'black') ||
            (r.result === '0-1' && r.color === 'white'),
          ).length;
          return (
            <>
            <div className="grid grid-cols-3 gap-3 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{wins}</p>
                <p className="text-xs text-gray-500">Vitórias</p>
              </div>
              <div>
                <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{draws}</p>
                <p className="text-xs text-gray-500">Empates</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-500 dark:text-red-400">{losses}</p>
                <p className="text-xs text-gray-500">Derrotas</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <TiebreakRow info={TIEBREAK_INFO.buchholz} value={formatTiebreak(playerRow.buchholz)} />
              <TiebreakRow info={TIEBREAK_INFO.buchholz_cut1} value={formatTiebreak(playerRow.buchholz_cut1)} />
              <TiebreakRow info={TIEBREAK_INFO.sonneborn_berger} value={formatTiebreak(playerRow.sonneborn_berger)} />
            </div>
            </>
          );
        })() : null}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-3">
          <Button
            variant={isFollowing ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => toggleFollow.mutate()}
            loading={toggleFollow.isPending}
          >
            {isFollowing ? '★ Seguindo' : '☆ Acompanhar'}
          </Button>
          <ShareButton title={`${displayName} – ${tournament.name}`} />
          {tournament.status === 'finished' && (
            <a href={`/api/certificates/${tpId}`} className="inline-flex min-h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-semibold text-brand-600 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              Certificado
            </a>
          )}
        </div>
      </div>

      {!hasPlayed && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
          <p className="font-semibold text-blue-900 dark:text-blue-200">{startLabel ?? 'Aguardando a primeira rodada'}</p>
          <p className="mt-1 text-sm text-blue-800/80 dark:text-blue-300/80">
            Esta é a posição inicial no grupo. Pontos, partidas e critérios de desempate aparecerão após a publicação dos resultados.
          </p>
        </div>
      )}

      {/* Round history */}
      <div className="card">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Histórico de rodadas</h2>
        </div>
        {loadingHistory ? (
          <div className="py-8 flex justify-center"><PageSpinner /></div>
        ) : (history?.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">A primeira partida ainda não foi publicada.</p>
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
      href={`/torneios/${tournamentSlug}/rounds/${row.round_number}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
    >
      {/* Round number */}
      <span className="text-xs font-bold text-gray-400 dark:text-gray-500 shrink-0">
        Rodada {row.round_number}
      </span>

      {/* Color indicator */}
      {isWhite ? (
        <svg className="h-4 w-3 shrink-0" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <title>Brancas</title>
          <circle cx="10" cy="5.5" r="4" fill="white" stroke="#9ca3af" strokeWidth="1.5" />
          <path d="M7 10.5C7 10.5 5.5 13 5 15H15C14.5 13 13 10.5 13 10.5C12 10 11 9.5 10 9.5C9 9.5 8 10 7 10.5Z" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M3 24H17L15 17H5L3 24Z" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="h-4 w-3 shrink-0" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">
          <title>Pretas</title>
          <circle cx="10" cy="5.5" r="4" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" />
          <path d="M7 10.5C7 10.5 5.5 13 5 15H15C14.5 13 13 10.5 13 10.5C12 10 11 9.5 10 9.5C9 9.5 8 10 7 10.5Z" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M3 24H17L15 17H5L3 24Z" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}

      {/* Opponent */}
      <div className="flex-1 min-w-0">
        {row.is_bye ? (
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {row.result === 'not_paired' ? 'NÃO EMPARC.' : 'BYE'}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
              {row.opponent_title && <span className="text-gray-400 dark:text-gray-500 font-normal">{row.opponent_title} </span>}
              {row.opponent_name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {row.opponent_rating ? `Rating ${row.opponent_rating}` : 'Sem rating'}
              {row.opponent_rank ? ` · ${row.opponent_rank}º colocado` : ''}
              {/* Pontuação atual do adversário — pra conferir Buchholz/Sonneborn-Berger na mão
                  sem precisar abrir a classificação em outra aba e cruzar nome por nome. */}
              {row.opponent_points !== null ? ` · ${formatScore(row.opponent_points)} pts` : ''}
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
