'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { tournamentKeys } from './use-tournament';
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
          tournament:tournaments(id, slug, name, status, start_date, end_date, registration_end_date, registration_closes_by_date, city, state)
        `)
        .eq('player_id', playerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/**
 * Cadastra um jogador — ou reaproveita, se o ID CBX informado já existir.
 * O ID CBX é a chave de deduplicação: sem essa checagem, cadastrar o mesmo
 * jogador em dois torneios criaria dois registros de players duplicados
 * (players/page.tsx não pede mais pra buscar por nome antes de cadastrar).
 */
export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: PlayerFormValues) => {
      const cbxId = values.cbx_id?.trim();
      if (cbxId) {
        const { data: existing, error: findError } = await supabase
          .from('players').select('*').eq('cbx_id', cbxId).maybeSingle();
        if (findError) throw findError;
        if (existing) return existing;
      }
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

/** Edita os dados cadastrais de um jogador já existente (nome, nascimento, IDs...). */
export function useUpdatePlayer(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PlayerFormValues> }) => {
      const { data, error } = await supabase
        .from('players')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.players(tournamentId) }),
  });
}

export interface CbxRatingResult {
  ratingStd: number | null;
  ratingRpd: number | null;
  ratingBlz: number | null;
  checkedAt: string;
  fromCache: boolean;
  playerName: string | null;
}

/**
 * Consulta o rating do jogador na CBX pelo ID CBX cadastrado — a rota faz o
 * scraping e o cache de 30 dias (app/api/admin/players/[playerId]/cbx-rating).
 * `tournamentId` só serve pra saber qual lista de participantes invalidar
 * depois — use-player.ts não tem esse contexto sozinho.
 */
export function useSyncCbxRating(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (playerId: string): Promise<CbxRatingResult> => {
      const res = await fetch(`/api/admin/players/${playerId}/cbx-rating`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao consultar rating na CBX');
      return body as CbxRatingResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tournamentKeys.players(tournamentId) }),
  });
}
