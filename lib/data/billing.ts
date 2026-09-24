import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Interruptor global de cobrança (migration 082, `app_settings.billing_enabled`).
 * Desligado = tudo gratuito: a régua de planos abre tudo no banco e as telas de
 * assinatura somem. Erro na leitura (ex.: migration ainda não aplicada) vale
 * como ligado — mesmo comportamento de antes do interruptor existir.
 */
export const isBillingEnabled = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('billing_enabled');
  if (error || typeof data !== 'boolean') return true;
  return data;
});
