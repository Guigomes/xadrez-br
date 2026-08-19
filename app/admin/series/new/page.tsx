'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SeriesForm, type SeriesFormPayload } from '@/components/series/series-form';
import { useCreateSeries } from '@/lib/hooks/use-series';
import { useUser, useProfile } from '@/lib/hooks/use-auth';
import { PageSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { slugify } from '@/lib/utils/chess';
import type { ClassificationDimension, SeriesTiebreakKey } from '@/types/database';

const FORM_ID = 'new-series-form';

export default function NewSeriesPage() {
  const router = useRouter();
  const { user } = useUser();
  const { data: profile, isLoading: loadingProfile } = useProfile();
  const create = useCreateSeries();
  const [error, setError] = useState('');

  // Estado dos controles que não são inputs registrados no react-hook-form
  // (chips e picker) — mesmo arranjo da tela de novo torneio.
  const [dimensions, setDimensions] = useState<ClassificationDimension[]>([]);
  const [absolute, setAbsolute] = useState(true);
  const [pointsOutside, setPointsOutside] = useState(0);
  const [tiebreak, setTiebreak] = useState<SeriesTiebreakKey[]>([
    'events', 'best_place', 'chess_points',
  ]);

  const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;

  useEffect(() => {
    if (!loadingProfile && profile && !canCreate) router.replace('/admin');
  }, [loadingProfile, profile, canCreate, router]);

  if (loadingProfile || !profile || !canCreate) return <PageSpinner />;

  async function handleSubmit(values: SeriesFormPayload) {
    if (!user) return;
    setError('');
    try {
      // Sufixo do ano pra não colidir entre edições anuais do mesmo circuito.
      // Sem data definida, cai no ano corrente.
      const year = (values.start_date || new Date().toISOString()).slice(0, 4);
      const slug = `${slugify(values.name)}-${year}`;

      const created = await create.mutateAsync({
        slug,
        name: values.name,
        description: values.description || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
        organizer_name: values.organizer_name,
        start_date: values.start_date || undefined,
        end_date: values.end_date || undefined,
        classification_dimensions: values.classification_dimensions,
        has_absolute_classification: values.has_absolute_classification,
        points_outside_table: values.points_outside_table,
        tiebreak_order: values.tiebreak_order,
        created_by: user.id,
      });

      // Direto pra Pontuação: sem tabela de pontos a série existe mas não
      // classifica ninguém — é a única configuração que falta pra ela
      // funcionar, então é onde o organizador precisa cair.
      router.push(`/admin/series/${created.slug}/pontuacao?criada=1`);
    } catch (err: any) {
      setError(
        err?.code === '23505'
          ? 'Já existe uma série com esse nome neste ano.'
          : err?.message ?? 'Erro ao criar a série.'
      );
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nova série</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Um festival ou circuito: agrupa torneios e soma a pontuação entre eles.
        </p>
      </div>

      <SeriesForm
        formId={FORM_ID}
        onSubmit={handleSubmit}
        dimensions={dimensions}
        onDimensionsChange={setDimensions}
        absolute={absolute}
        onAbsoluteChange={setAbsolute}
        pointsOutside={pointsOutside}
        onPointsOutsideChange={setPointsOutside}
        tiebreak={tiebreak}
        onTiebreakChange={setTiebreak}
      />

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <Button type="submit" form={FORM_ID} loading={create.isPending}>
          Criar série
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push('/admin/series')}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
