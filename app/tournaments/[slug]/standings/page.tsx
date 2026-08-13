'use client';

import { use } from 'react';
import { StandingsView } from '@/components/tournament/standings-view';

interface Props {
  params: Promise<{ slug: string }>;
}

/** A tela em si mora em components/tournament/standings-view.tsx — a mesma que
 *  o organizador vê em /admin/tournaments/[slug]/standings. */
export default function StandingsPage({ params }: Props) {
  const { slug } = use(params);
  return <StandingsView slug={slug} />;
}
