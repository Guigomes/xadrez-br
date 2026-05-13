'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTournament, useUpdateTournament, useDeleteTournament } from '@/lib/hooks/use-tournament';
import { TournamentForm } from '@/components/tournament/tournament-form';
import { PageSpinner } from '@/components/ui/spinner';
import { createClient } from '@/lib/supabase/client';
import type { TournamentFormValues } from '@/types/database';

interface Props {
  params: Promise<{ slug: string }>;
}

export default function EditTournamentPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const { data: tournament, isLoading } = useTournament(slug);
  const updateTournament = useUpdateTournament(tournament?.id ?? '');
  const deleteTournament = useDeleteTournament(slug);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      await deleteTournament.mutateAsync();
      router.push('/admin');
    } catch (err: any) {
      setError(err.message ?? 'Erro ao excluir.');
      setConfirmDelete(false);
    }
  }

  async function handleStatusChange(newStatus: 'registration' | 'ongoing' | 'finished' | 'cancelled') {
    const supabase = createClient();
    await supabase.from('tournaments').update({ status: newStatus }).eq('id', tournament!.id);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Editar torneio</h1>
        <div className="flex gap-2">
          <Link
            href={`/admin/tournaments/${slug}/players`}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Participantes
          </Link>
          <Link
            href={`/admin/tournaments/${slug}/rounds`}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Rodadas
          </Link>
          <Link
            href={`/admin/tournaments/${slug}/imports`}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Importações
          </Link>
          <Link
            href={`/tournaments/${slug}`}
            target="_blank"
            className="rounded-lg bg-brand-50 dark:bg-brand-950/50 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400"
          >
            Ver público
          </Link>
        </div>
      </div>

      {/* Status controls */}
      <div className="card p-4 mb-6">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Status do torneio</p>
        <div className="flex flex-wrap gap-2">
          {(['registration', 'ongoing', 'finished', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                ${tournament.status === s
                  ? 'bg-brand-600 text-white'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              {{ registration: 'Inscrições', ongoing: 'Em andamento', finished: 'Encerrado', cancelled: 'Cancelado' }[s]}
            </button>
          ))}
        </div>
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

      {/* Danger zone */}
      <div className="mt-8 rounded-lg border border-red-200 dark:border-red-900/60 p-4">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Zona de perigo</p>
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
