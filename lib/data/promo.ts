import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { parsePromoSetting } from '@/lib/promo/banner';

/**
 * Interruptor do banner do jogo (`app_settings.promo_banner_enabled`, leitura pública).
 * Diferente da cobrança, aqui erro de leitura vale como DESLIGADO: na dúvida, sem anúncio.
 * Ligar/desligar: `update app_settings set value = 'true'::jsonb where key = 'promo_banner_enabled';`
 */
export const isPromoBannerEnabled = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'promo_banner_enabled')
    .maybeSingle();
  if (error || !data) return false;
  return parsePromoSetting(data.value);
});
