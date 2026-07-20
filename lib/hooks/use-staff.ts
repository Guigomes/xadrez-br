'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StaffRole } from '@/types/database';

const supabase = createClient();

export interface StaffRow {
  id: string;
  user_id: string;
  role: StaffRole;
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
      return data;
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
      return data ?? [];
    },
  });
}

export function useAddStaff(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: StaffRole }) => {
      const { error } = await supabase.rpc('add_staff_by_email', {
        p_tournament_id: tournamentId, p_email: email, p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', tournamentId] }),
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
