'use client';

import { use } from 'react';
import { HistoryTournamentView } from '@/components/player-history/history-tournament-view';

export default function HistoryTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <HistoryTournamentView slug={slug} />;
}
