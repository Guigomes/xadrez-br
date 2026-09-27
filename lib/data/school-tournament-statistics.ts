import { createClient } from '@/lib/supabase/server';
import {
  buildSchoolTournamentStatistics,
  type SchoolTournamentStatisticInput,
} from '@/lib/statistics/school-tournament';

interface ParticipantRecord {
  id: string;
  pairing_group_id: string | null;
  player: {
    full_name: string;
    title: string | null;
    rating_std: number | null;
    state: string | null;
  } | null;
}

interface StandingRecord {
  tournament_player_id: string;
  rank: number | null;
  points: number;
}

/**
 * O cliente da sessão mantém RLS ativa; os dados-base são públicos no
 * torneio publicado.
 */
export async function getSchoolTournamentStatistics(tournamentId: string) {
  const supabase = await createClient();
  const [participantsResult, standingsResult, groupsResult] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('id, pairing_group_id, player:players(full_name, title, rating_std, state)')
      .eq('tournament_id', tournamentId),
    supabase
      .from('standings')
      .select('tournament_player_id, rank, points')
      .eq('tournament_id', tournamentId),
    supabase
      .from('pairing_groups')
      .select('id, name')
      .eq('tournament_id', tournamentId),
  ]);

  const error = participantsResult.error ?? standingsResult.error ?? groupsResult.error;
  if (error) throw new Error(`Falha ao carregar estatísticas do torneio: ${error.message}`);

  const participants = (participantsResult.data ?? []) as unknown as ParticipantRecord[];
  const standings = (standingsResult.data ?? []) as StandingRecord[];
  const groupById = new Map((groupsResult.data ?? []).map((group) => [group.id, group.name]));
  const standingByParticipant = new Map(
    standings.map((standing) => [standing.tournament_player_id, standing]),
  );

  const rows: SchoolTournamentStatisticInput[] = participants.map((participant) => {
    const standing = standingByParticipant.get(participant.id);
    return {
      participantId: participant.id,
      playerName: participant.player?.full_name ?? 'Jogador sem nome',
      playerTitle: participant.player?.title ?? null,
      rating: participant.player?.rating_std ?? null,
      state: participant.player?.state ?? null,
      groupId: participant.pairing_group_id,
      groupName: participant.pairing_group_id
        ? groupById.get(participant.pairing_group_id) ?? null
        : null,
      rank: standing?.rank ?? null,
      points: standing?.points ?? null,
    };
  });

  return buildSchoolTournamentStatistics(rows);
}
