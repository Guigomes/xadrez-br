'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}

export interface UserPlanCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  plan_code: string | null;
  plan_name: string | null;
}

/** Catálogo de planos — leitura pública (RLS: plans_select_all), pra popular o seletor. */
export function usePlanCatalog() {
  return useQuery({
    queryKey: ['plans'],
    staleTime: 300_000,
    queryFn: async (): Promise<PlanOption[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, code, name, sort_order')
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Autocomplete de usuário pra trocar plano — mesmo padrão de
 * useStaffCandidates (RLS de self-read em user_profiles exige RPC, migration
 * 074, gated por admin).
 */
export function useUserPlanSearch(query: string) {
  return useQuery({
    queryKey: ['user-plan-search', query.trim()],
    enabled: query.trim().length >= 3,
    staleTime: 30_000,
    queryFn: async (): Promise<UserPlanCandidate[]> => {
      const { data, error } = await supabase.rpc('search_users_for_plan', {
        p_query: query.trim(),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetUserPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, planCode }: { userId: string; planCode: string }) => {
      const { error } = await supabase.rpc('set_user_plan', {
        p_user_id: userId, p_plan_code: planCode,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-plan-search'] }),
  });
}
