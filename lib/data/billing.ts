import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { resolveBillingAvailability } from '@/lib/billing/organizer';

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

/** Selective launch: does not turn on reports, player plans or other paywalls. */
export const getSubscriptionBillingAvailability = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('app_settings')
    .select('key, value').in('key', ['billing_enabled', 'organizer_billing_enabled', 'player_history_billing_enabled']);
  if (error) throw new Error('Não foi possível consultar a assinatura de organizador.');
  return resolveBillingAvailability(data ?? []);
});

export const isOrganizerBillingEnabled = cache(async (): Promise<boolean> =>
  (await getSubscriptionBillingAvailability()).organizerBilling);
