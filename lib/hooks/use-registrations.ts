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
 * Aprova uma inscrição: encontra ou cria o player global, insere o
 * tournament_player no grupo da inscrição e marca a inscrição como aprovada.
 * (Fluxo client-side provisório — vira a RPC approve_registration na fase F2/F8
 * do design de torneios nativos.)
 */
export function useApproveRegistration(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ registration, userId }: { registration: RegistrationRow; userId: string }) => {
      const supabase = createClient();

      // 1. Encontrar player existente por CBX ID, FIDE ID ou nome exato
      let playerId: string | null = null;
      if (registration.cbx_id) {
        const { data } = await supabase
          .from('players').select('id').eq('cbx_id', registration.cbx_id).limit(1).maybeSingle();
        playerId = data?.id ?? null;
      }
      if (!playerId && registration.fide_id) {
        const { data } = await supabase
          .from('players').select('id').eq('fide_id', registration.fide_id).limit(1).maybeSingle();
        playerId = data?.id ?? null;
      }
      if (!playerId) {
        const { data } = await supabase
          .from('players').select('id').ilike('full_name', registration.full_name.trim()).limit(1).maybeSingle();
        playerId = data?.id ?? null;
      }

      // 2. Criar player se não existe
      if (!playerId) {
        const { data, error } = await supabase
          .from('players')
          .insert({
            full_name: registration.full_name.trim(),
            birth_year: registration.birth_year,
            city: registration.city,
            federation: registration.federation,
            fide_id: registration.fide_id,
            cbx_id: registration.cbx_id,
            rating_std: registration.rating_std,
          })
          .select('id')
          .single();
        if (error) throw new Error(`Erro ao criar jogador: ${error.message}`);
        playerId = data.id;
      }

      // 3. Inserir no torneio (ou reutilizar se já inscrito)
      let tpId: string;
      const { data: existingTp } = await supabase
        .from('tournament_players')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId)
        .maybeSingle();
      if (existingTp) {
        tpId = existingTp.id;
      } else {
        const { data, error } = await supabase
          .from('tournament_players')
          .insert({
            tournament_id: tournamentId,
            player_id: playerId,
            pairing_group_id: registration.pairing_group_id,
            status: 'active',
          })
          .select('id')
          .single();
        if (error) throw new Error(`Erro ao inscrever jogador: ${error.message}`);
        tpId = data.id;
      }

      // 4. Marcar inscrição como aprovada
      const { error: updErr } = await supabase
        .from('tournament_registrations')
        .update({
          status: 'approved',
          player_id: playerId,
          tournament_player_id: tpId,
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', registration.id);
      if (updErr) throw new Error(`Erro ao atualizar inscrição: ${updErr.message}`);
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
