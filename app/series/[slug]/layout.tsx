import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { SeriesTabs } from '@/components/series/series-tabs';
import { Badge } from '@/components/ui/badge';
import { ShareButton } from '@/components/ui/share-button';
import {
  SERIES_STATUS_COLOR, SERIES_STATUS_LABEL, describeDimensions, formatSeriesPeriod,
} from '@/lib/utils/series';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('tournament_series').select('name, description').eq('slug', slug).single();
  if (!data) return { title: 'Série não encontrada' };
  return {
    title: data.name,
    description: data.description ?? `Classificação acumulada de ${data.name}.`,
  };
}

export default async function SeriesLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // RLS já esconde rascunho de quem não gerencia — sem linha aqui é 404 pro
  // visitante e página normal pro organizador.
  const { data: series } = await supabase
    .from('tournament_series')
    .select('name, description, status, start_date, end_date, city, state, organizer_name, classification_dimensions')
    .eq('slug', slug)
    .single();

  if (!series) notFound();

  return (
    <div>
      <div className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="container-app pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{series.name}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {[series.city, series.state].filter(Boolean).join(', ')}
                {series.city || series.state ? ' · ' : ''}
                {formatSeriesPeriod(series.start_date, series.end_date)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ShareButton title={series.name} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className={SERIES_STATUS_COLOR[series.status]}>
              {SERIES_STATUS_LABEL[series.status]}
            </Badge>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              classifica por {describeDimensions(series.classification_dimensions)}
            </span>
          </div>
          <div className="mt-4">
            <SeriesTabs slug={slug} />
          </div>
        </div>
      </div>
      <div className="container-app py-6">{children}</div>
    </div>
  );
}
