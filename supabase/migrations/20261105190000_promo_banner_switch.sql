-- Interruptor do banner do jogo "Miguel no Reino do Xadrez" nas abas do torneio
-- (components/promo/promo-banner.tsx). app_settings já tem leitura pública e escrita
-- só de admin (082). Não sobrescreve o valor em reaplicações.
insert into public.app_settings (key, value)
values ('promo_banner_enabled', 'true'::jsonb)
on conflict (key) do nothing;
