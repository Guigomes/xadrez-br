'use client';

import { useQuery } from '@tanstack/react-query';
import type { OrganizerSubscriptionStatus } from '@/lib/billing/organizer';

export function useOrganizerSubscription(slug: string, tournamentId: string) {
  return useQuery({
    queryKey: ['organizer-subscription', tournamentId],
    enabled: !!tournamentId,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<OrganizerSubscriptionStatus> => {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(slug)}/organizer-subscription`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível verificar a assinatura.');
      return body;
    },
  });
}
