'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  Tournament, TournamentFormValues, TournamentListItem,
  TournamentCategory, Round, StandingRow, RoundPairingRow,
  TournamentPlayer, PairingResultUpdate, GameResult,
} from '@/types/database';

const supabase = createClient();

// ============================================================
// Query keys
// ============================================================
export const tournamentKeys = {
  all:         ['tournaments'] as const,
  lists:       () => [...tournamentKeys.all, 'list'] as const,
  list:        (filters: Record<string, unknown>) => [...tournamentKeys.lists(), filters] as const,
  detail:      (slug: string) => [...tournamentKeys.all, 'detail', slug] as const,
  categories:  (id: string)  => [...tournamentKeys.all, id, 'categories'] as const,
  players:     (id: string)  => [...tournamentKeys.all, id, 'players'] as const,
  rounds:      (id: string)  => [...tournamentKeys.all, id, 'rounds'] as const,
  standings:   (id: string)  => [...tournamentKeys.all, id, 'standings'] as const,
  pairings:    (roundId: string) => ['pairings', roundId] as const,
  playerHistory: (tid: string, tpId: string) => ['player-history', tid, tpId] as const,
};

// ============================================================
// Public hooks
// ============================================================

export function useTournamentList(filters?: { query?: string; state?: string; status?: string }) {
  return useQuery({
    queryKey: tournamentKeys.list(filters ?? {}),
    queryFn: async (): Promise<TournamentListItem[]> => {
      const { data, error } = await supabase.rpc('search_tournaments', {
        p_query:  filters?.query  || undefined,
        p_state:  filters?.state  || undefined,
        p_status: (filters?.status as any) || undefined,
        p_limit:  50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useTournament(slug: string) {
  return useQuery({
    queryKey: tournamentKeys.detail(slug),
    queryFn: async (): Promise<Tournament | null> => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function useTournamentCategories(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.categories(tournamentId),
    enabled: !!tournamentId,
    queryFn: async (): Promise<TournamentCategory[]> => {
      const { data, error } = await supabase
        .from('tournament_categories')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });
}

export function useTournamentPlayers(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.players(tournamentId),
    enabled: !!tournamentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_players')
        .select(`
          *,
          player:players(*),
          category:tournament_categories(name)
        `)
        .eq('tournament_id', tournamentId)
        .order('initial_ranking', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useTournamentRounds(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.rounds(tournamentId),
    enabled: !!tournamentId,
    queryFn: async (): Promise<Round[]> => {
      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round_number');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useTournamentStandings(tournamentId: string) {
  return useQuery({
    queryKey: tournamentKeys.standings(tournamentId),
    enabled: !!tournamentId,
    queryFn: async (): Promise<StandingRow[]> => {
      const { data, error } = await supabase.rpc('get_tournament_standings', {
        p_tournament_id: tournamentId,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useRoundPairings(roundId: string) {
  return useQuery({
    queryKey: tournamentKeys.pairings(roundId),
    enabled: !!roundId,
    queryFn: async (): Promise<RoundPairingRow[]> => {
      const { data, error } = await supabase.rpc('get_round_pairings', {
        p_round_id: roundId,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function usePlayerHistory(tournamentId: string, tpId: string) {
  return useQuery({
    queryKey: tournamentKeys.playerHistory(tournamentId, tpId),
    enabled: !!tournamentId && !!tpId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_player_tournament_history', {
        p_tournament_id: tournamentId,
        p_tp_id: tpId,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

// ============================================================
// Admin mutations
// ============================================================

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: TournamentFormValues & { created_by: string }) => {
      const { data, error } = await supabase
        .from('tournaments')
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.lists() }),
  });
}

export function useUpdateTournament(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<TournamentFormValues>) => {
      const { data, error } = await supabase
        .from('tournaments')
        .update(values)
        .eq('id', tournamentId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: tournamentKeys.lists() });
      qc.invalidateQueries({ queryKey: tournamentKeys.detail(data.slug) });
    },
  });
}

export function useCreateRound(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roundNumber: number) => {
      const { data, error } = await supabase
        .from('rounds')
        .insert({ tournament_id: tournamentId, round_number: roundNumber, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.rounds(tournamentId) }),
  });
}

export function useUpdateRoundStatus(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roundId, status }: { roundId: string; status: 'pending' | 'ongoing' | 'finished' }) => {
      const { error } = await supabase
        .from('rounds')
        .update({ status, published_at: status === 'ongoing' ? new Date().toISOString() : undefined })
        .eq('id', roundId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.rounds(tournamentId) }),
  });
}

export function useUpdatePairingResult(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pairingId, result }: { pairingId: string; result: GameResult }) => {
      const pointMap: Record<GameResult, [number | null, number | null]> = {
        '1-0':          [1, 0],
        '0-1':          [0, 1],
        '1/2-1/2':     [0.5, 0.5],
        '*':            [null, null],
        'bye':          [1, null],
        'forfeit_white':[0, 1],
        'forfeit_black':[1, 0],
        'double_forfeit':[0, 0],
      };
      const [wp, bp] = pointMap[result];
      const { error } = await supabase
        .from('pairings')
        .update({ result, white_points: wp, black_points: bp })
        .eq('id', pairingId);
      if (error) throw error;
    },
    onSuccess: async (_, { pairingId }) => {
      // Recalculate standings via RPC
      await supabase.rpc('recalculate_standings', { p_tournament_id: tournamentId });
      qc.invalidateQueries({ queryKey: tournamentKeys.standings(tournamentId) });
      qc.invalidateQueries({ queryKey: ['pairings'] });
    },
  });
}

export function useDeleteTournament(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tournaments/${slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erro ao excluir.');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tournamentKeys.lists() });
      qc.removeQueries({ queryKey: tournamentKeys.detail(slug) });
    },
  });
}

export function useAddTournamentPlayer(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { player_id: string; category_id?: string; initial_ranking?: number }) => {
      const { data, error } = await supabase
        .from('tournament_players')
        .insert({ tournament_id: tournamentId, ...payload, current_score: 0 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.players(tournamentId) }),
  });
}
