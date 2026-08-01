'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AdminTournamentTabs } from './admin-tournament-tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { createClient } from '@/lib/supabase/client';
import { tournamentKeys } from '@/lib/hooks/use-tournament';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';
import { TOUR_STEPS } from '@/lib/tour/steps';
import { writeProgress } from '@/lib/tour/state';
import type { TournamentMode, TournamentStatus } from '@/types/database';

interface Props {
  id: string;
  slug: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  registrationEndDate: string | null;
}

/**
 * Transições manuais por status — exceção ao avanço automático por data
 * (registration -> registration_closed, e published/registration/
 * registration_closed -> ongoing, migration 040/043). 'finished' não tem
 * entrada: estado terminal, sem botão. 'cancelled' fica de fora — cancelar
 * mora na zona de perigo (edit/page.tsx), reativar mora no bloco isCancelled
 * abaixo. Movido de edit/page.tsx pra cá: viver aqui, fora das abas, evita
 * duplicar o mesmo badge+status em dois lugares da mesma tela.
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

/**
 * Cabeçalho + abas do admin do torneio. Ausente no painel focado de
 * resultados do árbitro (rounds/[roundId]/results) — aquela tela é
 * mobile-first e não deve competir com a navegação por abas.
 */
export function AdminTournamentChrome({ id, slug, name, mode, status, registrationEndDate }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [statusSaving, setStatusSaving] = useState<TournamentStatus | null>(null);
  const [statusSaved, setStatusSaved] = useState(false);
  const [error, setError] = useState('');

  if (/\/rounds\/[^/]+\/results/.test(pathname)) return null;

  async function handleStatusChange(newStatus: TournamentStatus) {
    setError('');
    setStatusSaved(false);
    setStatusSaving(newStatus);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase.from('tournaments').update({ status: newStatus }).eq('id', id);
      if (updErr) throw updErr;
      await qc.invalidateQueries({ queryKey: tournamentKeys.detail(slug) });
      // Badge/abas vêm de props de Server Component, lidas uma vez no
      // layout — invalidar o React Query não alcança isso (mesmo motivo de
      // antes, quando este controle morava em edit/page.tsx).
      router.refresh();
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Erro ao atualizar status.');
    } finally {
      setStatusSaving(null);
    }
  }

  function startTour() {
    writeProgress(TOUR_STEPS[0].id);
    router.push('/admin');
  }

  const isCancelled = status === 'cancelled';

  return (
    <div className="mb-6">
      {/* Nome sozinho na própria linha — dividindo a linha com os botões de
          ação (como antes) ele colapsava pra largura zero em telas estreitas:
          truncate liga overflow:hidden, que pelo spec de flexbox zera o
          min-width automático do item, e os botões (shrink-0) levavam todo o
          espaço. O nome do torneio sumia por completo no mobile. */}
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{name}</h1>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={getTournamentStatusColor(status, registrationEndDate)}>
            {status === 'ongoing' && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
            {getTournamentStatusLabel(status, registrationEndDate)}
          </Badge>
          {isCancelled ? (
            <button
              onClick={() => handleStatusChange('draft')}
              disabled={!!statusSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {statusSaving === 'draft' && <Spinner className="h-3 w-3" />} Reativar torneio
            </button>
          ) : (
            (STATUS_ACTIONS[status] ?? []).map((action) => (
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
                {statusSaving === action.to && <Spinner className="h-3 w-3" />}
                {action.label}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={startTour}
          title="Dicas de como criar um torneio"
          aria-label="Dicas de como criar um torneio"
          className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          ❔
        </button>
      </div>
      {statusSaved && (
        <span className="mt-2 inline-block text-xs font-medium text-green-600 dark:text-green-400 animate-pulse">
          ✓ Salvo
        </span>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="mt-4">
        <AdminTournamentTabs slug={slug} mode={mode} status={status} />
      </div>
    </div>
  );
}
