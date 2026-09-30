-- Cidade de origem do acesso, via cabeçalho de geo da Vercel (x-vercel-ip-city
-- / x-vercel-ip-country-region), resolvido no edge — o app nunca vê nem grava
-- o IP, mantendo a promessa já exibida no painel ("Nenhum endereço IP é
-- armazenado"). Por evento (mais preciso, a rede pode mudar entre visitas) e
-- também no aparelho como "última conhecida" (mesmo padrão de last_path).
-- Só passa a preencher daqui pra frente; eventos antigos ficam null.

alter table public.site_access_events
  add column if not exists city text check (city is null or char_length(city) <= 100),
  add column if not exists region text check (region is null or char_length(region) <= 10);

alter table public.site_devices
  add column if not exists last_city text check (last_city is null or char_length(last_city) <= 100),
  add column if not exists last_region text check (last_region is null or char_length(last_region) <= 10);
