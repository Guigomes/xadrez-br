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
    state: string | null;
    club_or_school: string | null;
  } | null;
}

interface StandingRecord {
  tournament_player_id: string;
  rank: number | null;
}

/**
 * Consulta usada somente depois de a rota confirmar role=admin. O cliente da
 * sessão mantém RLS ativa; os dados-base já são públicos no torneio publicado.
 */
export async function getSchoolTournamentStatistics(tournamentId: string) {
  const supabase = await createClient();
  const [participantsResult, standingsResult, groupsResult] = await Promise.all([
    supabase
      .from('tournament_players')
      .select('id, pairing_group_id, player:players(full_name, state, club_or_school)')
      .eq('tournament_id', tournamentId),
    supabase
      .from('standings')
      .select('tournament_player_id, rank')
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
  const rankByParticipant = new Map(
    standings.map((standing) => [standing.tournament_player_id, standing.rank]),
  );

  const rows: SchoolTournamentStatisticInput[] = participants.map((participant) => ({
    participantId: participant.id,
    playerName: participant.player?.full_name ?? 'Jogador sem nome',
    state: participant.player?.state ?? null,
    school: participant.player?.club_or_school ?? null,
    groupId: participant.pairing_group_id,
    groupName: participant.pairing_group_id
      ? groupById.get(participant.pairing_group_id) ?? null
      : null,
    rank: rankByParticipant.get(participant.id) ?? null,
  }));

  return buildSchoolTournamentStatistics(rows);
}
