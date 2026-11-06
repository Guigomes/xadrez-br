'use client';

import { useQuery } from '@tanstack/react-query';
import type { PlayerHistoryAccess } from '@/lib/billing/player-history';

export function usePlayerHistoryAccess(viewerId?: string) {
  return useQuery({
    queryKey: ['player-history-access', viewerId ?? null],
    enabled: !!viewerId,
    staleTime: 0,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PlayerHistoryAccess> => {
      const response = await fetch('/api/subscriptions/player-history', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível verificar o acesso.');
      return body;
    },
  });
}
