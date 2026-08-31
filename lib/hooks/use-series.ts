'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  TournamentSeries, SeriesPointsRule, SeriesScopeRow,
  SeriesStandingRow, SeriesBreakdownRow, Tournament,
} from '@/types/database';

const supabase = createClient();

// ============================================================
// Query keys
// ============================================================
export const seriesKeys = {
  all:        ['series'] as const,
  lists:      () => [...seriesKeys.all, 'list'] as const,
  list:       (filters: Record<string, unknown>) => [...seriesKeys.lists(), filters] as const,
  mine:       () => [...seriesKeys.all, 'mine'] as const,
  detail:     (slug: string) => [...seriesKeys.all, 'detail', slug] as const,
  rules:      (id: string) => [...seriesKeys.all, id, 'rules'] as const,
  stages:     (id: string) => [...seriesKeys.all, id, 'stages'] as const,
  scopes:     (id: string) => [...seriesKeys.all, id, 'scopes'] as const,
  standings:  (id: string, scope: string) => [...seriesKeys.all, id, 'standings', scope] as const,
  breakdown:  (id: string, identity: string, scope: string) =>
    [...seriesKeys.all, id, 'breakdown', identity, scope] as const,
};

/** Etapa como a UI precisa: o vínculo + o torneio embutido. */
export interface SeriesStage {
  id: string;
  series_id: string;
  tournament_id: string;
  label: string | null;
  sort_order: number;
  tournament: Pick<
    Tournament,
    'id' | 'slug' | 'name' | 'status' | 'start_date' | 'end_date' | 'city' | 'state'
  > & { classification_dimensions: string[] | null };
}

// ============================================================
// Leitura
// ============================================================

export function useSeriesList(filters?: { query?: string; state?: string }) {
  return useQuery({
    queryKey: seriesKeys.list(filters ?? {}),
    queryFn: async (): Promise<TournamentSeries[]> => {
      // Sem RPC de busca: a RLS já esconde rascunho, e o volume de séries é
      // ordens de grandeza menor que o de torneios — filtro no cliente basta.
      let q = supabase
        .from('tournament_series')
        .select('*')
        .order('start_date', { ascending: false, nullsFirst: false })
        .limit(50);
      if (filters?.state) q = q.eq('state', filters.state);
      if (filters?.query) q = q.ilike('name', `%${filters.query}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TournamentSeries[];
    },
    staleTime: 30_000,
  });
}

export function useSeries(slug: string) {
  return useQuery({
    queryKey: seriesKeys.detail(slug),
    queryFn: async (): Promise<TournamentSeries | null> => {
      const { data, error } = await supabase
        .from('tournament_series')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TournamentSeries | null;
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useSeriesStages(seriesId: string | undefined) {
  return useQuery({
    queryKey: seriesKeys.stages(seriesId ?? ''),
    queryFn: async (): Promise<SeriesStage[]> => {
      const { data, error } = await supabase
        .from('series_tournaments')
        .select(
          'id, series_id, tournament_id, label, sort_order, ' +
            'tournament:tournaments(id, slug, name, status, start_date, end_date, city, state, classification_dimensions)'
        )
        .eq('series_id', seriesId!)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as unknown as SeriesStage[];
    },
    enabled: !!seriesId,
    staleTime: 30_000,
  });
}

export function useSeriesRules(seriesId: string | undefined) {
  return useQuery({
    queryKey: seriesKeys.rules(seriesId ?? ''),
    queryFn: async (): Promise<SeriesPointsRule[]> => {
      const { data, error } = await supabase
        .from('series_points_rules')
        .select('*')
        .eq('series_id', seriesId!)
        .order('place');
      if (error) throw error;
      return (data ?? []) as SeriesPointsRule[];
    },
    enabled: !!seriesId,
    staleTime: 60_000,
  });
}

export function useSeriesScopes(seriesId: string | undefined) {
  return useQuery({
    queryKey: seriesKeys.scopes(seriesId ?? ''),
    queryFn: async (): Promise<SeriesScopeRow[]> => {
      const { data, error } = await supabase.rpc('get_series_scopes', { p_series_id: seriesId! });
      if (error) throw error;
      return (data ?? []) as SeriesScopeRow[];
    },
    enabled: !!seriesId,
    staleTime: 30_000,
  });
}

export function useSeriesStandings(seriesId: string | undefined, scopeKey: string | undefined) {
  return useQuery({
    queryKey: seriesKeys.standings(seriesId ?? '', scopeKey ?? ''),
    queryFn: async (): Promise<SeriesStandingRow[]> => {
      const { data, error } = await supabase.rpc('get_series_standings', {
        p_series_id: seriesId!,
        p_scope_key: scopeKey!,
      });
      if (error) throw error;
      return (data ?? []) as SeriesStandingRow[];
    },
    enabled: !!seriesId && !!scopeKey,
    staleTime: 30_000,
  });
}

export function useSeriesBreakdown(
  seriesId: string | undefined,
  identityKey: string | undefined,
  scopeKey: string | undefined
) {
  return useQuery({
    queryKey: seriesKeys.breakdown(seriesId ?? '', identityKey ?? '', scopeKey ?? ''),
    queryFn: async (): Promise<SeriesBreakdownRow[]> => {
      const { data, error } = await supabase.rpc('get_series_player_breakdown', {
        p_series_id: seriesId!,
        p_identity_key: identityKey!,
        p_scope_key: scopeKey!,
      });
      if (error) throw error;
      return (data ?? []) as SeriesBreakdownRow[];
    },
    enabled: !!seriesId && !!identityKey && !!scopeKey,
    staleTime: 60_000,
  });
}

/**
 * Torneios que o usuário pode vincular: os que ele organiza e que ainda não
 * são etapa desta série. O filtro de compatibilidade de classificação NÃO é
 * feito aqui — a lista mostra tudo e marca o incompatível, senão o organizador
 * fica sem entender por que o torneio dele "sumiu".
 */
export function useLinkableTournaments(userId: string | undefined) {
  return useQuery({
    queryKey: [...seriesKeys.all, 'linkable', userId ?? ''] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, slug, name, status, start_date, city, state, classification_dimensions')
        .eq('created_by', userId!)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

// ============================================================
// Mutações
// ============================================================

export function useCreateSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<TournamentSeries> & { slug: string; name: string; created_by: string }) => {
      const { data, error } = await supabase
        .from('tournament_series')
        .insert(values)
        .select('id, slug')
        .single();
      if (error) throw error;
      return data as { id: string; slug: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seriesKeys.lists() });
      qc.invalidateQueries({ queryKey: seriesKeys.mine() });
    },
  });
}

export function useUpdateSeries(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<TournamentSeries>) => {
      const { data, error } = await supabase
        .from('tournament_series')
        .update(values)
        .eq('id', seriesId)
        .select()
        .single();
      if (error) throw error;
      return data as TournamentSeries;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: seriesKeys.lists() });
      qc.invalidateQueries({ queryKey: seriesKeys.detail(data.slug) });
    },
  });
}

export function useDeleteSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seriesId: string) => {
      const { error } = await supabase.from('tournament_series').delete().eq('id', seriesId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: seriesKeys.all }),
  });
}

/** Invalida tudo que depende do cálculo (escopos, classificação, etapas). */
function invalidateComputed(qc: ReturnType<typeof useQueryClient>, seriesId: string) {
  qc.invalidateQueries({ queryKey: seriesKeys.stages(seriesId) });
  qc.invalidateQueries({ queryKey: seriesKeys.scopes(seriesId) });
  qc.invalidateQueries({ queryKey: [...seriesKeys.all, seriesId, 'standings'] });
}

export function useAddStage(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tournamentId, label }: { tournamentId: string; label?: string }) => {
      const { data, error } = await supabase.rpc('add_tournament_to_series', {
        p_series_id: seriesId,
        p_tournament_id: tournamentId,
        p_label: label || undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateComputed(qc, seriesId),
  });
}

export function useRemoveStage(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tournamentId: string) => {
      const { error } = await supabase.rpc('remove_tournament_from_series', {
        p_series_id: seriesId,
        p_tournament_id: tournamentId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateComputed(qc, seriesId),
  });
}

export function useSetPointsRules(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rules: { place: number; points: number }[]) => {
      const { data, error } = await supabase.rpc('set_series_points_rules', {
        p_series_id: seriesId,
        p_rules: rules,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: seriesKeys.rules(seriesId) });
      invalidateComputed(qc, seriesId);
    },
  });
}

export function useRecalculateSeries(seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('recalculate_series_standings', {
        p_series_id: seriesId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => invalidateComputed(qc, seriesId),
  });
}
