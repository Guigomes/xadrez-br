-- Contador de cliques no banner de propaganda (components/promo/promo-banner.tsx).
--
-- Uma linha por clique: campanha, página onde estava o banner, tipo de aparelho
-- e, quando há sessão, a conta (pedido do dono: saber quem clicou). Visitante
-- sem conta fica sem identificação nenhuma — nem IP nem id de aparelho.
--
-- Escrita só pela rota POST /api/promo/click (service_role, depois de validar o
-- corpo); leitura só para admin. Sem policy de insert para o cliente.

create table if not exists public.promo_clicks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  campaign text not null check (length(campaign) between 1 and 80),
  path text check (path is null or length(path) <= 500),
  device_type text check (device_type is null or device_type in ('desktop', 'mobile', 'tablet', 'other')),
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists idx_promo_clicks_campaign_created on public.promo_clicks (campaign, created_at desc);
create index if not exists idx_promo_clicks_user on public.promo_clicks (user_id) where user_id is not null;

alter table public.promo_clicks enable row level security;

drop policy if exists promo_clicks_select_admin on public.promo_clicks;
create policy promo_clicks_select_admin on public.promo_clicks
  for select to authenticated
  using ((select public.auth_user_role()) = 'admin');

revoke insert, update, delete on public.promo_clicks from anon, authenticated;
