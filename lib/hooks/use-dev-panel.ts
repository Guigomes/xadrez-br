'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export function useAllTournaments() {
  return useQuery({
    queryKey: ['dev-all-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, slug, name, mode, status')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTestPlayersCount() {
  return useQuery({
    queryKey: ['dev-test-players-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('players').select('id', { count: 'exact', head: true })
        .eq('is_test', true);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useGenerateTestPlayers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tournamentId, groupId, count }: { tournamentId: string; groupId: string; count: number }) => {
      const { data, error } = await supabase.rpc('generate_test_players', {
        p_tournament_id: tournamentId, p_group_id: groupId, p_count: count,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev-test-players-count'] });
      qc.invalidateQueries({ queryKey: ['tournament-players'] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useCleanupTestPlayers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('cleanup_test_players');
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
