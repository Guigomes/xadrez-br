'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SeriesForm, type SeriesFormPayload } from '@/components/series/series-form';
import { useSeries, useSeriesStages, useUpdateSeries, useDeleteSeries } from '@/lib/hooks/use-series';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import type { ClassificationDimension, SeriesTiebreakKey } from '@/types/database';

const FORM_ID = 'edit-series-form';

export default function EditSeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { data: series, isLoading } = useSeries(slug);
  const { data: stages } = useSeriesStages(series?.id);
  const update = useUpdateSeries(series?.id ?? '');
  const del = useDeleteSeries();

  const [dimensions, setDimensions] = useState<ClassificationDimension[]>([]);
  const [absolute, setAbsolute] = useState(true);
  const [pointsOutside, setPointsOutside] = useState(0);
  const [tiebreak, setTiebreak] = useState<SeriesTiebreakKey[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!series) return;
    setDimensions(series.classification_dimensions ?? []);
    setAbsolute(series.has_absolute_classification);
    setPointsOutside(series.points_outside_table);
    setTiebreak(series.tiebreak_order ?? []);
  }, [series]);

  if (isLoading || !series) return <PageSpinner />;

  const stageCount = stages?.length ?? 0;

  async function handleSubmit(values: SeriesFormPayload) {
    setError('');
    setSaved(false);
    try {
      await update.mutateAsync({
        name: values.name,
        description: values.description || null,
        city: values.city || null,
        state: values.state || null,
        organizer_name: values.organizer_name,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        classification_dimensions: values.classification_dimensions,
        has_absolute_classification: values.has_absolute_classification,
        points_outside_table: values.points_outside_table,
        tiebreak_order: values.tiebreak_order,
      });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível salvar.');
    }
  }

  async function handleDelete() {
    try {
      await del.mutateAsync(series!.id);
      router.push('/admin/series');
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível excluir a série.');
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <SeriesForm
        formId={FORM_ID}
        defaultValues={{
          name: series.name,
          description: series.description ?? '',
          city: series.city ?? '',
          state: series.state ?? '',
          organizer_name: series.organizer_name ?? '',
          start_date: series.start_date ?? '',
          end_date: series.end_date ?? '',
        }}
        onSubmit={handleSubmit}
        dimensions={dimensions}
        onDimensionsChange={setDimensions}
        absolute={absolute}
        onAbsoluteChange={setAbsolute}
        pointsOutside={pointsOutside}
        onPointsOutsideChange={setPointsOutside}
        tiebreak={tiebreak}
        onTiebreakChange={setTiebreak}
        lockedDimensionsReason={
          stageCount > 0
            ? `${stageCount} etapa(s) já vinculada(s) com esta classificação. Mudar aqui não desvincula ninguém, mas etapas com classificação diferente passam a ser incompatíveis — e novas só entram se baterem com o novo padrão.`
            : undefined
        }
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" form={FORM_ID} loading={update.isPending}>
          Salvar
        </Button>
        {saved && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ Salvo</span>
        )}
      </div>

      <div className="card border-red-200 p-5 dark:border-red-900/60">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Zona de perigo</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Excluir a série apaga o vínculo com as etapas e a classificação acumulada.{' '}
          <strong>Os torneios em si não são afetados</strong> — continuam existindo com resultados
          intactos.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmDelete ? (
            <>
              <Button variant="danger" onClick={handleDelete} loading={del.isPending}>
                Confirmar exclusão
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Excluir série
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
