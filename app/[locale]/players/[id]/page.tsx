'use client';

import { use } from 'react';
import { PlayerProfileView } from '@/components/player-history/player-profile-view';

interface Props {
  params: Promise<{ id: string }>;
}

export default function PlayerProfilePage({ params }: Props) {
  const { id } = use(params);
  return <PlayerProfileView id={id} />;
}
