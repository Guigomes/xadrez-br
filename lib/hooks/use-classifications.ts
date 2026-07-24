'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TournamentCategory, PairingMode } from '@/types/database';

const supabase = createClient();

export const categoryKeys = {
  list: (tournamentId: string) => ['classifications', tournamentId] as const,
};

export function useCategories(tournamentId: string) {
  return useQuery({
    queryKey: categoryKeys.list(tournamentId),
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
  });
}

export interface CategoryInput {
  name: string;
  min_age?: number | null;
  max_age?: number | null;
  min_rating?: number | null;
  max_rating?: number | null;
  sex?: 'm' | 'w' | null;
}

export function useCreateCategory(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data, error } = await supabase
        .from('tournament_categories')
        .insert({ tournament_id: tournamentId, ...normalize(input) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.list(tournamentId) }),
  });
}

export function useUpdateCategory(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CategoryInput> & { pairing_group_id?: string | null } }) => {
      const { error } = await supabase
        .from('tournament_categories')
        .update(normalizePartial(patch))
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.list(tournamentId) }),
  });
}

export function useDeleteCategory(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tournament_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.list(tournamentId) }),
  });
}

export function useSetPairingMode(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: PairingMode) => {
      const { error } = await supabase
        .from('tournaments')
        .update({ pairing_mode: mode })
        .eq('id', tournamentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

function normalize(input: CategoryInput) {
  return {
    name: input.name.trim(),
    min_age: input.min_age ?? null,
    max_age: input.max_age ?? null,
    min_rating: input.min_rating ?? null,
    max_rating: input.max_rating ?? null,
    sex: input.sex ?? null,
  };
}

function normalizePartial(patch: Partial<CategoryInput> & { pairing_group_id?: string | null }) {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name.trim();
  if (patch.min_age !== undefined) out.min_age = patch.min_age;
  if (patch.max_age !== undefined) out.max_age = patch.max_age;
  if (patch.min_rating !== undefined) out.min_rating = patch.min_rating;
  if (patch.max_rating !== undefined) out.max_rating = patch.max_rating;
  if (patch.sex !== undefined) out.sex = patch.sex;
  if (patch.pairing_group_id !== undefined) out.pairing_group_id = patch.pairing_group_id;
  return out;
}
