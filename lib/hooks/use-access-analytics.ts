'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessDashboardData } from '@/lib/analytics/types';

const QUERY_KEY = ['dev-access-analytics'];

export function useAccessAnalytics() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<AccessDashboardData> => {
      const response = await fetch('/api/admin/dev/accesses', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível carregar os acessos.');
      return body as AccessDashboardData;
    },
    refetchInterval: 60_000,
  });
}

export function useMarkOwnerDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId, isOwner, label }: { deviceId: string; isOwner: boolean; label?: string }) => {
      const response = await fetch('/api/admin/dev/accesses', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, isOwner, label }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Não foi possível identificar o aparelho.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
