import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Interruptor global do pagamento online de inscrição (migration 20261028140000,
 * `app_settings.registration_payment_enabled`). Desligado = inscrição segue o fluxo manual e
 * nenhuma cobrança nova é gerada; a configuração de cada torneio fica guardada. Erro na leitura
 * vale como ligado (comportamento de antes).
 */
export const isRegistrationPaymentEnabled = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('registration_payment_enabled');
  if (error || typeof data !== 'boolean') return true;
  return data;
});
