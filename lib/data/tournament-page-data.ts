import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Tournament, TournamentStatus } from '@/types/database';

export interface TournamentPageData {
  tournament: Tournament;
  currentRoundNumber: number | null;
  effectiveStatus: TournamentStatus;
  lastImportAt: string | null;
  lastImportStatus: string | null;
}

/**
 * Busca tudo que layout.tsx e as abas do torneio precisam num round-trip só
 * (RPC get_tournament_page_data, migration 071). Envolvida em `cache()` do
 * React pra o layout e a página filha (ex.: participants/page.tsx) que
 * pedem o mesmo slug dentro do mesmo request dividirem a mesma chamada —
 * a segunda vira memoização, não uma nova viagem ao Supabase.
 */
export const getTournamentPageData = cache(async (slug: string): Promise<TournamentPageData | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('get_tournament_page_data', { p_slug: slug })
    .maybeSingle();

  if (error || !data) return null;

  return {
    tournament: data.tournament as Tournament,
    currentRoundNumber: data.current_round_number,
    effectiveStatus: data.effective_status,
    lastImportAt: data.last_import_at,
    lastImportStatus: data.last_import_status,
  };
});
