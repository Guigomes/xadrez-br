'use client';

import { use } from 'react';
import Link from 'next/link';
import { SeriesStandingsView } from '@/components/series/series-standings-view';

export default function AdminSeriesStandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Classificação da série</h2>
        <Link
          href={`/series/${slug}/classificacao`}
          className="text-sm text-brand-600 hover:underline dark:text-brand-400"
        >
          Ver página pública
        </Link>
      </div>
      <SeriesStandingsView slug={slug} showRecalculate />
    </div>
  );
}
