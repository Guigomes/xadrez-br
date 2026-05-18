'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Player, PlayerFormValues } from '@/types/database';

const supabase = createClient();

export const playerKeys = {
  all:    ['players'] as const,
  lists:  () => [...playerKeys.all, 'list'] as const,
  search: (q: string) => [...playerKeys.lists(), q] as const,
  detail: (id: string) => [...playerKeys.all, id] as const,
  tournaments: (id: string) => [...playerKeys.all, id, 'tournaments'] as const,
};

export function usePlayerSearch(query: string) {
  return useQuery({
    queryKey: playerKeys.search(query),
    queryFn: async (): Promise<Player[]> => {
      if (!query.trim()) return [];
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .ilike('full_name', `%${query}%`)
        .order('full_name')
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: query.trim().length >= 2,
  });
}

export function usePlayer(playerId: string) {
  return useQuery({
    queryKey: playerKeys.detail(playerId),
    queryFn: async (): Promise<Player | null> => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 300_000,
  });
}

export function usePlayerTournaments(playerId: string) {
  return useQuery({
    queryKey: playerKeys.tournaments(playerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_players')
        .select(`
          *,
          tournament:tournaments(id, slug, name, status, start_date, end_date, registration_end_date, city, state)
        `)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: PlayerFormValues) => {
      const { data, error } = await supabase
        .from('players')
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: playerKeys.lists() }),
  });
}
