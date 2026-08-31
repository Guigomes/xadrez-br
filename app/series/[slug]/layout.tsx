import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSeriesHeader } from '@/lib/data/series-page-data';
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
  const data = await getSeriesHeader(slug);
  if (!data) return { title: 'Série não encontrada' };
  return {
    title: data.name,
    description: data.description ?? `Classificação acumulada de ${data.name}.`,
  };
}

export default async function SeriesLayout({ children, params }: Props) {
  const { slug } = await params;

  // Mesma chamada do generateMetadata acima — memoizada por request
  // (lib/data/series-page-data.ts), então não repete a consulta.
  const series = await getSeriesHeader(slug);

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
