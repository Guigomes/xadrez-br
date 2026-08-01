'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTournament, useUpdateTournament, useDeleteTournament, tournamentKeys } from '@/lib/hooks/use-tournament';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { ClassificationSetup } from '@/components/admin/classification-setup';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import type { TournamentFormValues, TournamentStatus } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function EditTournamentPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: tournament, isLoading } = useTournament(slug);
  const updateTournament = useUpdateTournament(tournament?.id ?? '');
  const deleteTournament = useDeleteTournament(slug);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusSaving, setStatusSaving] = useState<TournamentStatus | null>(null);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p className="text-red-500">Torneio não encontrado.</p>;

  async function handleSubmit(values: TournamentFormValues) {
    setError('');
    try {
      await updateTournament.mutateAsync(values);
      // Volta pra Visão geral (de onde se chega aqui pelo botão "Editar
      // torneio"), não pro painel geral — Editar deixou de ser aba.
      router.push(`/admin/tournaments/${slug}`);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao salvar.');
    }
  }

  async function handleDelete() {
    try {
      const deletedName = tournament?.name ?? '';
      await deleteTournament.mutateAsync();
      router.push(`/admin?excluido=${encodeURIComponent(deletedName)}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Erro ao excluir.');
      setConfirmDelete(false);
    }
  }

  async function handleStatusChange(newStatus: TournamentStatus) {
    setError('');
    setStatusSaving(newStatus);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from('tournaments').update({ status: newStatus }).eq('id', tournament!.id);
      if (updErr) throw updErr;
      await qc.invalidateQueries({ queryKey: tournamentKeys.detail(slug) });
      // O badge/abas do cabeçalho (AdminTournamentChrome/Tabs) vêm de props
      // de Server Component, lidas uma vez no layout — invalidar o React
      // Query não alcança isso. Sem o refresh, o cabeçalho só refletiria
      // "cancelado" depois de um F5 manual.
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Erro ao atualizar status.');
    } finally {
      setStatusSaving(null);
    }
  }

  const isCancelled = tournament.status === 'cancelled';

  return (
    <div className="max-w-2xl">
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <TournamentForm
        defaultValues={tournament as any}
        onSubmit={handleSubmit}
        loading={updateTournament.isPending}
        submitLabel="Salvar alterações"
        formId="tournament-edit-form"
      />

      {/* Só Classificação aqui — Emparceiramento tem aba própria
          (app/admin/tournaments/[slug]/groups), pra não duplicar a seção. */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
        <ClassificationSetup
          tournamentId={tournament.id}
          mode={tournament.mode}
          defaultRounds={tournament.rounds_count}
          currentMode={tournament.pairing_mode}
          currentSplit={tournament.pairing_split ?? null}
          initialDimensions={tournament.classification_dimensions ?? []}
          showPairing={false}
        />
      </div>

      {/* Salvar fica depois de Classificação — o form em si (TournamentForm,
          formId acima) não muda, só onde o botão aparece: `form="tournament-
          edit-form"` submete de fora, via atributo HTML5. */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
        <Button type="submit" form="tournament-edit-form" loading={updateTournament.isPending} size="lg" className="w-full sm:w-auto">
          Salvar alterações
        </Button>
      </div>

      {/* Danger zone — cancelar e excluir juntos: as duas ações incomuns,
          fora do fluxo normal de status. */}
      <div className="mt-8 rounded-lg border border-red-200 dark:border-red-900/60 p-4">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Zona de perigo</p>

        {!isCancelled && (
          <div className="mb-4 pb-4 border-b border-red-100 dark:border-red-900/40">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Cancelar interrompe o torneio sem apagar nada — dá pra reativar depois.
            </p>
            <button
              onClick={() => handleStatusChange('cancelled')}
              disabled={!!statusSaving}
              className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
            >
              {statusSaving === 'cancelled' && <Spinner />} Cancelar torneio
            </button>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Excluir o torneio remove permanentemente todos os participantes, rodadas e resultados.
        </p>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-red-700 dark:text-red-400">Tem certeza? Esta ação não pode ser desfeita.</span>
            <button
              onClick={handleDelete}
              disabled={deleteTournament.isPending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteTournament.isPending ? 'Excluindo...' : 'Confirmar exclusão'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Excluir torneio
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
