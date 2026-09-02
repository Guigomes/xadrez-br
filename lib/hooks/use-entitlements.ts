'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { EntitlementKey } from '@/lib/data/entitlements';

const supabase = createClient();

interface EntitlementRow {
  key: string;
  enabled: boolean;
  limit_int: number | null;
  used: number | null;
}

/**
 * Versão client-side de lib/data/entitlements.ts — mesmo RPC
 * (get_my_entitlements), pra telas 'use client' que não têm acesso ao
 * getEntitlements() do servidor (ex.: gate de limite antes de abrir um
 * formulário todo em estado local, como admin/tournaments/new).
 */
export function useEntitlements() {
  const { data, isLoading } = useQuery({
    queryKey: ['entitlements'],
    staleTime: 30_000,
    queryFn: async (): Promise<EntitlementRow[]> => {
      const { data, error } = await supabase.rpc('get_my_entitlements');
      if (error) throw error;
      return (data ?? []) as EntitlementRow[];
    },
  });

  const byKey: Record<string, EntitlementRow | undefined> = {};
  for (const row of data ?? []) byKey[row.key] = row;

  return {
    isLoading,
    atLimit(key: EntitlementKey): boolean {
      const e = byKey[key];
      if (!e || e.limit_int === null || e.used === null) return false;
      return e.used >= e.limit_int;
    },
  };
}
