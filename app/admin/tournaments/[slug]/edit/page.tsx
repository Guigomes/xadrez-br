'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTournament, useUpdateTournament, useDeleteTournament, tournamentKeys } from '@/lib/hooks/use-tournament';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { PageSpinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import type { TournamentFormValues, TournamentStatus } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * Transições manuais por status — exceção ao avanço automático por data
 * (registration -> registration_closed, e published/registration/
 * registration_closed -> ongoing, migration 040). 'finished' não tem
 * entrada: estado terminal, sem botão. 'cancelled' fica de fora — cancelar
 * mora na zona de perigo, reativar mora no bloco isCancelled abaixo.
 */
const STATUS_ACTIONS: Partial<Record<TournamentStatus, { label: string; to: TournamentStatus; primary: boolean }[]>> = {
  draft: [
    { label: 'Publicar', to: 'published', primary: true },
  ],
  published: [
    { label: 'Voltar pra Rascunho', to: 'draft', primary: false },
    { label: 'Abrir Inscrições', to: 'registration', primary: true },
  ],
  registration: [
    { label: 'Encerrar Inscrições', to: 'registration_closed', primary: true },
  ],
  registration_closed: [
    { label: 'Reabrir Inscrições', to: 'registration', primary: false },
    { label: 'Iniciar Torneio', to: 'ongoing', primary: true },
  ],
  ongoing: [
    { label: 'Encerrar Torneio', to: 'finished', primary: true },
  ],
};

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
  const [statusSaved, setStatusSaved] = useState(false);

  if (isLoading) return <PageSpinner />;
  if (!tournament) return <p className="text-red-500">Torneio não encontrado.</p>;

  async function handleSubmit(values: TournamentFormValues) {
    setError('');
    try {
      await updateTournament.mutateAsync(values);
      router.push('/admin');
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
    setStatusSaved(false);
    setStatusSaving(newStatus);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from('tournaments').update({ status: newStatus }).eq('id', tournament!.id);
      if (updErr) throw updErr;
      await qc.invalidateQueries({ queryKey: tournamentKeys.detail(slug) });
      // O badge/abas do cabeçalho (AdminTournamentChrome/Tabs) vêm de props
      // de Server Component, lidas uma vez no layout — invalidar o React
      // Query não alcança isso. Sem o refresh, a aba Rodadas só aparecia
      // depois de um F5 manual assim que ela passou a depender do status.
      router.refresh();
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao atualizar status.');
    } finally {
      setStatusSaving(null);
    }
  }

  const isCancelled = tournament.status === 'cancelled';

  return (
    <div className="max-w-2xl">
      {/* Status control — botão nomeado por exceção (STATUS_ACTIONS acima);
          o avanço normal (fim da inscrição, início do torneio) já acontece
          sozinho por data (migration 040). Cancelar/excluir moraram pra
          zona de perigo. */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Status do torneio</p>
          {statusSaved && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400 animate-pulse">
              ✓ Salvo
            </span>
          )}
        </div>

        {isCancelled ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Badge className={getTournamentStatusColor(tournament.status, tournament.registration_end_date)}>
              {getTournamentStatusLabel(tournament.status, tournament.registration_end_date)}
            </Badge>
            <button
              onClick={() => handleStatusChange('draft')}
              disabled={!!statusSaving}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Reativar torneio
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={getTournamentStatusColor(tournament.status, tournament.registration_end_date)}>
              {getTournamentStatusLabel(tournament.status, tournament.registration_end_date)}
            </Badge>
            <div className="flex flex-wrap items-center gap-2">
              {(STATUS_ACTIONS[tournament.status] ?? []).map((action) => (
                <button
                  key={action.to}
                  onClick={() => handleStatusChange(action.to)}
                  disabled={!!statusSaving}
                  className={
                    action.primary
                      ? 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50'
                      : 'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'
                  }
                >
                  {statusSaving === action.to && <Spinner />}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
      />

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
