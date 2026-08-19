'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AdminSeriesTabs } from './admin-series-tabs';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { createClient } from '@/lib/supabase/client';
import { seriesKeys } from '@/lib/hooks/use-series';
import { SERIES_STATUS_COLOR, SERIES_STATUS_LABEL } from '@/lib/utils/series';
import type { SeriesStatus } from '@/types/database';

interface Props {
  id: string;
  slug: string;
  name: string;
  status: SeriesStatus;
  /** false quando a série ainda não tem tabela de pontos — publicar não faria nada. */
  hasPointsRules: boolean;
  stageCount: number;
}

/**
 * Stepper de situação, mesmo padrão do AdminTournamentChrome. Série não tem
 * transição automática por data: o ciclo é curto e inteiramente manual, então
 * não existe o equivalente a next_status_by_date aqui.
 */
const STATUS_ACTIONS: Partial<
  Record<SeriesStatus, { label: string; to: SeriesStatus; primary: boolean }[]>
> = {
  draft: [{ label: 'Publicar', to: 'published', primary: true }],
  published: [
    { label: 'Voltar pra Rascunho', to: 'draft', primary: false },
    { label: 'Encerrar série', to: 'finished', primary: true },
  ],
  finished: [{ label: 'Reabrir', to: 'published', primary: false }],
};

export function AdminSeriesChrome({ id, slug, name, status, hasPointsRules, stageCount }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<SeriesStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function handleStatusChange(next: SeriesStatus) {
    setError('');
    setSaved(false);
    setSaving(next);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from('tournament_series').update({ status: next }).eq('id', id);
      if (updErr) throw updErr;
      qc.invalidateQueries({ queryKey: seriesKeys.detail(slug) });
      setSaved(true);
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível mudar a situação.');
    } finally {
      setSaving(null);
    }
  }

  // Publicar sem tabela de pontos deixaria a classificação pública zerada
  // para todo mundo — o cálculo roda, mas toda colocação vale
  // points_outside_table. Mesmo tratamento de "botão visível e desabilitado
  // com o motivo" que o torneio usa pro emparceiramento incompleto.
  const blockedReason = !hasPointsRules
    ? 'Cadastre a tabela de pontos antes de publicar.'
    : stageCount === 0
      ? 'Vincule pelo menos uma etapa antes de publicar.'
      : null;

  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{name}</h1>
      <div
        className={`mt-2 flex flex-wrap items-center gap-2 transition-opacity ${
          isPending ? 'opacity-60 cursor-progress' : ''
        }`}
      >
        <Badge className={SERIES_STATUS_COLOR[status]}>{SERIES_STATUS_LABEL[status]}</Badge>
        {(STATUS_ACTIONS[status] ?? []).map((action) => {
          const blocked = action.to === 'published' && status === 'draft' && !!blockedReason;
          return (
            <button
              key={action.to}
              onClick={() => handleStatusChange(action.to)}
              disabled={!!saving || blocked}
              title={blocked ? blockedReason! : undefined}
              className={
                action.primary
                  ? 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'
              }
            >
              {saving === action.to && <Spinner className="h-3 w-3" />}
              {action.label}
            </button>
          );
        })}
      </div>

      {status === 'draft' && blockedReason && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{blockedReason}</p>
      )}

      {/* Slot de altura fixa: alternar só a opacidade evita as abas pularem. */}
      <div className="mt-2 h-4" aria-live="polite">
        <span
          className={`text-xs font-medium text-green-600 dark:text-green-400 transition-opacity duration-200 ${
            saved ? 'opacity-100' : 'opacity-0'
          }`}
        >
          ✓ Salvo
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4">
        <AdminSeriesTabs slug={slug} />
      </div>
    </div>
  );
}
