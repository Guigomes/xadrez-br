'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TournamentRegistration } from '@/types/database';

export type RegistrationRow = TournamentRegistration & {
  pairing_groups: { name: string } | null;
};

export function useRegistrations(tournamentId: string) {
  return useQuery({
    queryKey: ['registrations', tournamentId],
    enabled: !!tournamentId,
    queryFn: async (): Promise<RegistrationRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tournament_registrations')
        .select('*, pairing_groups(name)')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RegistrationRow[];
    },
  });
}

/**
 * Aprova uma inscrição via RPC approve_registration (migration 020):
 * encontra/cria o player global, cria o tournament_player no grupo (com
 * entrada tardia + byes se o torneio já começou) e marca como aprovada —
 * tudo numa transação, com auditoria.
 */
export function useApproveRegistration(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ registration }: { registration: RegistrationRow; userId: string }) => {
      const supabase = createClient();
      const { error } = await supabase.rpc('approve_registration', {
        p_registration_id: registration.id,
      });
      if (error) throw new Error(`Erro ao aprovar inscrição: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrations', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-players', tournamentId] });
    },
  });
}

export function useRejectRegistration(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ registrationId, reason }: { registrationId: string; reason: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('tournament_registrations')
        .update({ status: 'rejected', rejected_reason: reason || null })
        .eq('id', registrationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrations', tournamentId] });
    },
  });
}

/** Abre o comprovante de pagamento numa nova aba via signed URL (bucket privado). */
export async function openReceipt(path: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('payment-receipts')
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    throw new Error('Não foi possível abrir o comprovante.');
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}
