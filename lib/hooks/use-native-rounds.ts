'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { tournamentKeys } from './use-tournament';
import type { Round, PairingGroup } from '@/types/database';

const supabase = createClient();

export function useGroups(tournamentId: string) {
  return useQuery({
    queryKey: ['pairing-groups', tournamentId],
    enabled: !!tournamentId,
    queryFn: async (): Promise<PairingGroup[]> => {
      const { data, error } = await supabase
        .from('pairing_groups').select('*')
        .eq('tournament_id', tournamentId).order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroupRounds(groupId: string) {
  return useQuery({
    queryKey: ['group-rounds', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Round[]> => {
      const { data, error } = await supabase
        .from('rounds').select('*')
        .eq('pairing_group_id', groupId).order('round_number');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useInvalidate(tournamentId: string, groupId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['group-rounds', groupId] });
    qc.invalidateQueries({ queryKey: ['pairing-groups', tournamentId] });
    qc.invalidateQueries({ queryKey: ['pairings'] });
    qc.invalidateQueries({ queryKey: tournamentKeys.rounds(tournamentId) });
    qc.invalidateQueries({ queryKey: tournamentKeys.players(tournamentId) });
    qc.invalidateQueries({ queryKey: tournamentKeys.standings(tournamentId) });
  };
}

export function useCreateDefaultGroup(tournamentId: string) {
  const invalidate = useInvalidate(tournamentId, '');
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('pairing_groups')
        .insert({ tournament_id: tournamentId, name, sort_order: 0 });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCreateGroup(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, rounds_count, sort_order }: {
      name: string; rounds_count?: number | null; sort_order?: number;
    }) => {
      const { error } = await supabase.from('pairing_groups').insert({
        tournament_id: tournamentId,
        name: name.trim(),
        rounds_count: rounds_count ?? null,
        sort_order: sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pairing-groups', tournamentId] }),
  });
}

export function useUpdateGroup(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, rounds_count, sort_order }: {
      id: string; name?: string; rounds_count?: number | null; sort_order?: number;
    }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name.trim();
      if (rounds_count !== undefined) patch.rounds_count = rounds_count;
      if (sort_order !== undefined) patch.sort_order = sort_order;
      const { error } = await supabase.from('pairing_groups').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pairing-groups', tournamentId] }),
  });
}

export function useDeleteGroup(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pairing_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pairing-groups', tournamentId] });
      qc.invalidateQueries({ queryKey: tournamentKeys.players(tournamentId) });
    },
  });
}

export function useGenerateSeeds(tournamentId: string, groupId: string) {
  const invalidate = useInvalidate(tournamentId, groupId);
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('generate_initial_ranking', { p_group_id: groupId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRequestedByes(tournamentId: string, roundNumber: number) {
  return useQuery({
    queryKey: ['requested-byes', tournamentId, roundNumber],
    enabled: !!tournamentId && roundNumber > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('requested_byes').select('tp_id')
        .eq('tournament_id', tournamentId).eq('round_number', roundNumber);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.tp_id));
    },
  });
}

export function useToggleRequestedBye(tournamentId: string, roundNumber: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tpId, requested }: { tpId: string; requested: boolean }) => {
      if (requested) {
        const { error } = await supabase.from('requested_byes')
          .insert({ tournament_id: tournamentId, tp_id: tpId, round_number: roundNumber });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('requested_byes')
          .delete().eq('tp_id', tpId).eq('round_number', roundNumber);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requested-byes', tournamentId, roundNumber] }),
  });
}

export function useGenerateRound(tournamentSlug: string, tournamentId: string, groupId: string) {
  const invalidate = useInvalidate(tournamentId, groupId);
  return useMutation({
    mutationFn: async (roundNumber?: number) => {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentSlug}/groups/${groupId}/rounds/generate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(roundNumber ? { roundNumber } : {}) },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao gerar rodada');
      return body as { roundId: string; roundNumber: number };
    },
    onSuccess: invalidate,
  });
}

function roundRpc(name: 'publish_round' | 'finish_round' | 'reopen_round') {
  return async (roundId: string) => {
    const { error } = await supabase.rpc(name, { p_round_id: roundId });
    if (error) throw error;
  };
}

export function useRoundTransition(tournamentId: string, groupId: string) {
  const invalidate = useInvalidate(tournamentId, groupId);
  return useMutation({
    mutationFn: async ({ action, roundId }: { action: 'publish' | 'finish' | 'reopen'; roundId: string }) =>
      roundRpc(`${action}_round` as any)(roundId),
    onSuccess: invalidate,
  });
}

export function useDraftWarnings(tournamentSlug: string, roundId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['draft-warnings', roundId],
    enabled: enabled && !!roundId,
    queryFn: async () => {
      const res = await fetch(`/api/admin/tournaments/${tournamentSlug}/rounds/${roundId}/warnings`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao calcular avisos');
      return body.warnings as Array<{ code: string; board?: number | null; gap?: number }>;
    },
  });
}

export function useSwapDraft(tournamentId: string, groupId: string, roundId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate(tournamentId, groupId);
  return useMutation({
    mutationFn: async (moves: Array<{ pairing_id: string; white_tp: string; black_tp: string | null }>) => {
      const { error } = await supabase.rpc('swap_draft_players', {
        p_round_id: roundId, p_moves: moves,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['pairings', roundId] });
      qc.invalidateQueries({ queryKey: ['draft-warnings', roundId] });
    },
  });
}

export function useOverridePairing(tournamentId: string, groupId: string, roundId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate(tournamentId, groupId);
  return useMutation({
    mutationFn: async ({ moves, justification }: {
      moves: Array<{ pairing_id: string; white_tp: string; black_tp: string | null }>;
      justification: string;
    }) => {
      const { error } = await supabase.rpc('override_pairing_players', {
        p_round_id: roundId, p_moves: moves, p_justification: justification,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['pairings', roundId] });
      qc.invalidateQueries({ queryKey: ['pairing-history', roundId] });
    },
  });
}

export interface PairingOverrideEntry {
  id: number;
  created_at: string;
  actor_name: string | null;
  justification: string;
  moves: Array<{ board: number | null; white_name: string; black_name: string }>;
}

export function usePairingHistory(roundId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['pairing-history', roundId],
    enabled: enabled && !!roundId,
    queryFn: async (): Promise<PairingOverrideEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, created_at, payload')
        .eq('entity_id', roundId)
        .eq('action', 'override_pairing')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        actor_name: r.payload?.actor_name ?? null,
        justification: r.payload?.justification ?? '',
        moves: r.payload?.moves ?? [],
      }));
    },
  });
}

export function useSetResult(tournamentId: string, groupId: string) {
  const invalidate = useInvalidate(tournamentId, groupId);
  return useMutation({
    mutationFn: async ({ pairingId, result }: { pairingId: string; result: string }) => {
      const { error } = await supabase.rpc('set_pairing_result', {
        p_pairing_id: pairingId, p_result: result,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
