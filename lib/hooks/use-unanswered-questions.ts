'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { UnansweredQuestion } from '@/types/database';

const supabase = createClient();

/** Só role='admin' enxerga (unanswered_questions_select_admin, migration 055). */
export function useUnansweredQuestions(limit = 100) {
  return useQuery({
    queryKey: ['admin-unanswered-questions', limit],
    queryFn: async (): Promise<UnansweredQuestion[]> => {
      const { data, error } = await supabase
        .from('unanswered_questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
