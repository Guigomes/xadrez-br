-- ============================================================
-- Pedidos de relatório de desempenho (plano de monetização, frente 1)
-- ============================================================
-- Um pedido = o relatório de desempenho de UM jogador em UM torneio (ao vivo
-- ou do arquivo histórico). Quem pede é sempre um usuário logado e só pode
-- pedir de jogador com vínculo verificado em user_player_links — nunca por
-- nome. O relatório é produzido fora do site (skill chess-game-report) e
-- entregue pelo admin como PDF num bucket privado.
--
-- Cobrança: segue o interruptor global billing_enabled() (migration 082).
-- Desligado = pedido gratuito. Ligado = cobrança avulsa na Asaas pelo preço
-- em app_settings.report_price_cents (hipótese de partida, editável sem deploy).
--
-- Escrita só pelas rotas de API (service_role); o cliente só lê os próprios.
--
-- Idempotente.

create table if not exists report_orders (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references user_profiles(id) on delete cascade,
  player_id             uuid not null references players(id),
  tournament_id         uuid references tournaments(id) on delete set null,
  history_tournament_id uuid references history_tournaments(id) on delete set null,
  tournament_name       text not null,
  status                text not null default 'requested'
    check (status in ('requested', 'awaiting_payment', 'paid', 'in_progress', 'delivered', 'canceled')),
  price_cents           integer not null default 0 check (price_cents >= 0),
  payment_status        text not null default 'none'
    check (payment_status in ('none', 'pending', 'paid', 'overdue', 'refunded')),
  asaas_customer_id     text,
  asaas_payment_id      text,
  asaas_invoice_url     text,
  -- Muitos jogadores são menores: o pedido só vale com o aceite do responsável.
  guardian_consent      boolean not null default false,
  notes                 text,
  delivery_path         text,
  delivered_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint report_orders_has_tournament
    check (tournament_id is not null or history_tournament_id is not null)
);

create index if not exists idx_report_orders_user on report_orders(user_id, created_at desc);
create index if not exists idx_report_orders_status on report_orders(status, created_at desc);
create unique index if not exists uq_report_orders_asaas_payment
  on report_orders(asaas_payment_id) where asaas_payment_id is not null;
-- Evita pedido duplicado ativo do mesmo jogador para o mesmo torneio.
create unique index if not exists uq_report_orders_active_live
  on report_orders(user_id, player_id, tournament_id)
  where tournament_id is not null and status <> 'canceled';
create unique index if not exists uq_report_orders_active_history
  on report_orders(user_id, player_id, history_tournament_id)
  where history_tournament_id is not null and status <> 'canceled';

alter table report_orders enable row level security;

drop policy if exists report_orders_select_own on report_orders;
create policy report_orders_select_own on report_orders for select
  using (user_id = auth.uid() or auth_user_role() = 'admin');

-- Sem policy de insert/update/delete: só o service_role (rotas de API) escreve.

create or replace function report_orders_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_report_orders_touch on report_orders;
create trigger trg_report_orders_touch before update on report_orders
  for each row execute function report_orders_touch();

-- Preço de partida (R$ 39,00). Hipótese a validar; mudar é um UPDATE.
insert into app_settings (key, value) values ('report_price_cents', '3900')
on conflict (key) do nothing;

-- PDFs entregues: bucket privado, só service_role grava e gera link assinado.
insert into storage.buckets (id, name, public) values ('reports', 'reports', false)
on conflict (id) do nothing;
