'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StaffRole } from '@/types/database';

const supabase = createClient();

export interface StaffRow {
  id: string;
  user_id: string;
  role: StaffRole;
  /** pending = convidado, ainda sem acesso; accepted = na equipe; declined = recusou. */
  status: 'pending' | 'accepted' | 'declined';
  full_name: string | null;
  email: string | null;
}

export interface BoardArbiterRow {
  id: string;
  pairing_group_id: string;
  board_number: number;
  user_id: string;
}

export function useMyTournamentRole(tournamentId: string) {
  return useQuery({
    queryKey: ['my-role', tournamentId],
    enabled: !!tournamentId,
    queryFn: async (): Promise<'organizer' | 'arbiter' | null> => {
      const { data, error } = await supabase.rpc('get_my_tournament_role', {
        p_tournament_id: tournamentId,
      });
      if (error) throw error;
      // A RPC devolve `text`; a app restringe ao union.
      return data as 'organizer' | 'arbiter' | null;
    },
  });
}

export function useStaff(tournamentId: string) {
  return useQuery({
    queryKey: ['staff', tournamentId],
    enabled: !!tournamentId,
    queryFn: async (): Promise<StaffRow[]> => {
      const { data, error } = await supabase.rpc('get_tournament_staff', {
        p_tournament_id: tournamentId,
      });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
}

export interface StaffCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Autocomplete de candidato a membro da equipe — busca por nome OU e-mail a
 * partir do 3º caractere (mesmo padrão de usePlayerSearch). user_profiles tem
 * RLS de self-read, então a busca passa por RPC security definer gated por
 * organizador (migration 062).
 */
export function useStaffCandidates(tournamentId: string, query: string) {
  return useQuery({
    queryKey: ['staff-candidates', tournamentId, query.trim()],
    enabled: !!tournamentId && query.trim().length >= 3,
    staleTime: 60_000,
    queryFn: async (): Promise<StaffCandidate[]> => {
      const { data, error } = await supabase.rpc('search_staff_candidates', {
        p_tournament_id: tournamentId, p_query: query.trim(),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Convida para a equipe (migration 20261116120000). Vai pela rota do servidor
 * e não direto na RPC porque o push do convite precisa das chaves VAPID.
 * O membro entra como pendente e só ganha acesso quando aceitar.
 */
export function useInviteStaff(tournamentId: string, slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: StaffRole }) => {
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(slug)}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível enviar o convite.');
      return json as { ok: true; invited: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', tournamentId] });
      qc.invalidateQueries({ queryKey: ['staff-candidates', tournamentId] });
    },
  });
}

export function useRemoveStaff(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase.rpc('remove_staff', { p_staff_id: staffId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff', tournamentId] });
      qc.invalidateQueries({ queryKey: ['board-arbiters'] });
    },
  });
}

export function useBoardArbiters(groupId: string) {
  return useQuery({
    queryKey: ['board-arbiters', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<BoardArbiterRow[]> => {
      const { data, error } = await supabase
        .from('board_arbiters')
        .select('id, pairing_group_id, board_number, user_id')
        .eq('pairing_group_id', groupId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAssignBoard(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardNumber, userId }: { boardNumber: number; userId: string }) => {
      const { error } = await supabase.rpc('assign_board_arbiter', {
        p_group_id: groupId, p_board_number: boardNumber, p_user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board-arbiters', groupId] }),
  });
}

export function useUnassignBoard(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (boardNumber: number) => {
      const { error } = await supabase.rpc('unassign_board_arbiter', {
        p_group_id: groupId, p_board_number: boardNumber,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['board-arbiters', groupId] }),
  });
}

export interface StaffInvite {
  id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_slug: string;
  role: StaffRole;
  invited_by_name: string | null;
  created_at: string;
}

/** Convites de equipe pendentes da conta logada. */
export function useMyStaffInvites(enabled = true) {
  return useQuery({
    queryKey: ['my-staff-invites'],
    enabled,
    // Roda em toda página (selo do header): sem refetch a cada navegação.
    staleTime: 60_000,
    queryFn: async (): Promise<StaffInvite[]> => {
      const { data, error } = await supabase.rpc('get_my_staff_invites');
      if (error) throw error;
      return (data ?? []) as StaffInvite[];
    },
  });
}

export function useRespondStaffInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, accept }: { staffId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_staff_invite', {
        p_staff_id: staffId, p_accept: accept,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-staff-invites'] });
      qc.invalidateQueries({ queryKey: ['my-role'] });
    },
  });
}
