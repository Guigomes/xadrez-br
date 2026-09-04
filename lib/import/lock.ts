import type { SupabaseClient } from '@supabase/supabase-js';

// Portado de ../../cron-import/src/index.ts (acquireLock/releaseLock) —
// MESMA tabela cron_import_lock que o worker agendado usa. Import sob
// demanda precisa da mesma trava: sem ela, um clique no botão "forçar
// sincronização" enquanto o Cloud Scheduler roda por conta própria escreve
// nas mesmas tournament_players ao mesmo tempo (migration 072 documenta o
// bug de concorrência que essa trava evita).
const LOCK_STALE_MINUTES = 10;

export async function acquireImportLock(supabase: SupabaseClient): Promise<boolean> {
  const staleThreshold = new Date(Date.now() - LOCK_STALE_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from('cron_import_lock')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', 1)
    .or(`locked_at.is.null,locked_at.lt.${staleThreshold}`)
    .select('id');
  if (error) {
    console.error('[force-import] falha ao tentar travar:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function releaseImportLock(supabase: SupabaseClient): Promise<void> {
  await supabase.from('cron_import_lock').update({ locked_at: null }).eq('id', 1);
}
