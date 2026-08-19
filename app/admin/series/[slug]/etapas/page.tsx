'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useSeries, useSeriesStages, useSeriesScopes,
  useLinkableTournaments, useAddStage, useRemoveStage,
} from '@/lib/hooks/use-series';
import { useUser } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageSpinner } from '@/components/ui/spinner';
import { describeDimensions, dimensionsMatch } from '@/lib/utils/series';
import { getTournamentStatusColor, getTournamentStatusLabel } from '@/lib/utils/chess';

export default function SeriesStagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user } = useUser();
  const { data: series, isLoading } = useSeries(slug);
  const { data: stages } = useSeriesStages(series?.id);
  const { data: scopes } = useSeriesScopes(series?.id);
  const { data: candidates } = useLinkableTournaments(user?.id);

  const addStage = useAddStage(series?.id ?? '');
  const removeStage = useRemoveStage(series?.id ?? '');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState('');

  const linkedIds = useMemo(
    () => new Set((stages ?? []).map((s) => s.tournament_id)),
    [stages]
  );

  // A lista mostra TUDO que o organizador criou, marcando o incompatível —
  // filtrar sumiria com o torneio dele sem explicar por quê.
  const options = useMemo(
    () => (candidates ?? []).filter((t: any) => !linkedIds.has(t.id)),
    [candidates, linkedIds]
  );

  if (isLoading || !series) return <PageSpinner />;

  const pickedTournament = options.find((t: any) => t.id === picked);
  const pickedCompatible =
    !pickedTournament ||
    dimensionsMatch(pickedTournament.classification_dimensions, series.classification_dimensions);

  async function handleAdd() {
    if (!picked) return;
    setError('');
    try {
      await addStage.mutateAsync({ tournamentId: picked });
      setPicked('');
    } catch (err: any) {
      setError(
        String(err?.message ?? '').includes('CLASSIFICATION_MISMATCH')
          ? 'Esta etapa classifica de um jeito diferente da série. Ajuste a classificação do torneio antes de vincular.'
          : err?.message ?? 'Não foi possível vincular o torneio.'
      );
    }
  }

  const stageCount = stages?.length ?? 0;
  // Escopo que aparece numa etapa só, com a série tendo mais de uma etapa
  // pontuando, é quase sempre nome digitado diferente entre torneios
  // ("Sub 12" x "Sub-12") — o casamento é por nome normalizado e não tem como
  // adivinhar isso.
  const lonelyScopes = (scopes ?? []).filter(
    (s) => s.scope_key !== '__absoluto__' && s.events === 1 && stageCount > 1
  );

  return (
    <div className="max-w-3xl space-y-5">
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Vincular torneio</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Esta série classifica por <strong>{describeDimensions(series.classification_dimensions)}</strong>.
            Só entram torneios com a mesma classificação.
          </p>
        </div>

        {options.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum torneio disponível.{' '}
            <Link href="/admin/tournaments/new" className="text-brand-600 hover:underline dark:text-brand-400">
              Criar um torneio
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Torneio
              </label>
              <select
                value={picked}
                onChange={(e) => { setPicked(e.target.value); setError(''); }}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">Selecionar...</option>
                {options.map((t: any) => {
                  const ok = dimensionsMatch(t.classification_dimensions, series.classification_dimensions);
                  return (
                    <option key={t.id} value={t.id}>
                      {ok ? '' : '⚠ '}
                      {t.name}
                      {ok ? '' : ` — classifica por ${describeDimensions(t.classification_dimensions)}`}
                    </option>
                  );
                })}
              </select>
            </div>
            <Button onClick={handleAdd} loading={addStage.isPending} disabled={!picked || !pickedCompatible}>
              Vincular
            </Button>
          </div>
        )}

        {pickedTournament && !pickedCompatible && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Este torneio classifica por{' '}
            <strong>{describeDimensions(pickedTournament.classification_dimensions)}</strong> e a série,
            por <strong>{describeDimensions(series.classification_dimensions)}</strong>.{' '}
            <Link
              href={`/admin/tournaments/${pickedTournament.slug}/edit`}
              className="underline"
            >
              Ajustar a classificação desta etapa
            </Link>
            .
          </p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {lonelyScopes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {lonelyScopes.length === 1 ? 'Uma faixa aparece' : `${lonelyScopes.length} faixas aparecem`} em
            uma etapa só
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {lonelyScopes.map((s) => `"${s.scope_name}"`).join(', ')}. As faixas são casadas pelo nome
            entre as etapas — se a mesma categoria foi escrita diferente em dois torneios, cada versão
            vira um ranking separado. Confira o nome nas classificações de cada etapa.
          </p>
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">
          Etapas vinculadas ({stageCount})
        </h2>
        {stageCount === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhuma etapa ainda. Só torneio <strong>encerrado</strong> distribui pontos — os demais
            aparecem aqui, mas ficam fora da conta até terminar.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {stages!.map((s, i) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-3">
                <span className="text-sm tabular-nums text-gray-400 dark:text-gray-500">{i + 1}.</span>
                <Link
                  href={`/admin/tournaments/${s.tournament.slug}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                  {s.label || s.tournament.name}
                </Link>
                <Badge className={getTournamentStatusColor(s.tournament.status, null, true)}>
                  {getTournamentStatusLabel(s.tournament.status, null, true)}
                </Badge>
                {s.tournament.status !== 'finished' && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">não pontua ainda</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeStage.mutate(s.tournament_id)}
                  loading={removeStage.isPending && removeStage.variables === s.tournament_id}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
