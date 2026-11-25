import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import type { Database, StandingRow } from '@/types/database';

/**
 * Cache no servidor (Data Cache da Vercel) para dados de torneio ENCERRADO.
 *
 * Por quê: em 2026-11-25 o projeto estourou a cota de egress do Supabase (5 GB/mês no
 * plano Free) e a API ficou bloqueada. A maior parte do tráfego era a classificação
 * inteira (`get_tournament_standings`, 100–550 KB por chamada) relida a cada visita,
 * inclusive de torneio que já acabou e não muda mais.
 *
 * Só serve para o que é público: a leitura usa a chave anônima sem cookie (mesmo
 * acesso de quem abre o link sem login), porque dentro do `unstable_cache` não dá
 * para ler cookies e o resultado é dividido entre todos os visitantes.
 *
 * Correção feita direto no banco num torneio encerrado leva até `FINISHED_CACHE_SECONDS`
 * para aparecer (ou `revalidateTag(tournamentCacheTag(id))`).
 */
export const FINISHED_CACHE_SECONDS = 6 * 60 * 60;

export const tournamentCacheTag = (tournamentId: string) => `tournament:${tournamentId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

/**
 * Guarda o resultado de `load` por torneio. `load` precisa lançar em caso de erro:
 * erro não entra no cache, então a próxima visita tenta de novo.
 */
function cachedForTournament<T>(tournamentId: string, key: string, load: () => Promise<T>): Promise<T> {
  return unstable_cache(load, ['finished-tournament', key, tournamentId], {
    revalidate: FINISHED_CACHE_SECONDS,
    tags: [tournamentCacheTag(tournamentId)],
  })();
}

/** Classificação completa de um torneio encerrado. `null` = falhou; quem chama lê sem cache. */
export async function getFinishedStandings(tournamentId: string): Promise<StandingRow[] | null> {
  if (!UUID.test(tournamentId)) return null;
  try {
    return await cachedForTournament(tournamentId, 'standings', async () => {
      const { data, error } = await publicClient().rpc('get_tournament_standings', { p_tournament_id: tournamentId });
      if (error) throw new Error(error.message);
      return (data ?? []) as StandingRow[];
    });
  } catch {
    return null;
  }
}

/** Resultado de todas as partidas (aba Por país). `null` = falhou; quem chama lê sem cache. */
export async function getFinishedPairingResults(
  tournamentId: string,
): Promise<{ result: string; is_bye: boolean }[] | null> {
  if (!UUID.test(tournamentId)) return null;
  try {
    return await cachedForTournament(tournamentId, 'pairing-results', async () => {
      const supabase = publicClient();
      const results: { result: string; is_bye: boolean }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error } = await supabase
          .from('pairings')
          .select('id, result, is_bye')
          .eq('tournament_id', tournamentId)
          .order('id')
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        results.push(...(page ?? []).map((p) => ({ result: p.result, is_bye: p.is_bye })));
        if (!page || page.length < 1000) break;
      }
      return results;
    });
  } catch {
    return null;
  }
}

/** Status exibido do torneio (mesma regra de `get_tournament_page_data`), pela chave anônima. */
export async function isTournamentFinished(tournamentId: string): Promise<boolean> {
  if (!UUID.test(tournamentId)) return false;
  const supabase = publicClient();
  const { data: t } = await supabase.from('tournaments').select('slug').eq('id', tournamentId).maybeSingle();
  if (!t) return false;
  const { data } = await supabase.rpc('get_tournament_page_data', { p_slug: t.slug }).maybeSingle();
  return data?.effective_status === 'finished';
}
