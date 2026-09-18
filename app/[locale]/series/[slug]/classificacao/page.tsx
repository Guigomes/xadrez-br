'use client';

import { use } from 'react';
import { SeriesStandingsView } from '@/components/series/series-standings-view';

export default function SeriesStandingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <SeriesStandingsView slug={slug} />;
}
