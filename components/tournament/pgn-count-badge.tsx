'use client';

import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/lib/hooks/use-auth';
import { Link } from '@/i18n/navigation';

// A função do banco não está em types/database.generated.ts: usa o cliente sem tipos.
const supabase = createClient() as unknown as SupabaseClient;

// Selo público de quantas partidas têm lances. Os lances só abrem para quem está logado.
export function PgnCountBadge({ tournamentId }: { tournamentId: string }) {
  const { user, loading } = useUser();
  const { data: count } = useQuery({
    queryKey: ['history', 'pgn-count', tournamentId],
    staleTime: 300_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('get_tournament_pgn_count', { p_tournament_id: tournamentId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
  if (!count) return null;
  return (
    <>
      <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">♟ {count} com lances</Badge>
      {!loading && !user && (
        <Link href="/login" className="text-xs text-brand-700 dark:text-brand-300 underline underline-offset-2">
          entre para ver os lances
        </Link>
      )}
    </>
  );
}
