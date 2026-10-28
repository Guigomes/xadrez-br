import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Interruptor global do check-in (migration 20261028120000, `app_settings.checkin_enabled`).
 * Desligado = o check-in some de todas as telas e as funções do banco recusam; a configuração
 * de cada torneio fica guardada. Erro na leitura vale como ligado (comportamento de antes).
 */
export const isCheckinEnabled = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('checkin_enabled');
  if (error || typeof data !== 'boolean') return true;
  return data;
});
