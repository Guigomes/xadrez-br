'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ErrorLog } from '@/types/database';

const supabase = createClient();

/** Só role='admin' enxerga (error_logs_select_admin, migration 053). */
export function useErrorLogs(limit = 100) {
  return useQuery({
    queryKey: ['admin-error-logs', limit],
    queryFn: async (): Promise<ErrorLog[]> => {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
