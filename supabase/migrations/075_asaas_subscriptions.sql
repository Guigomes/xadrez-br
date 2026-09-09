-- ============================================================
-- Migration 075: assinaturas pagas via Asaas
-- ============================================================
-- Fecha o ciclo que a 073 deixou em aberto de propósito: `plans.price_cents`
-- e `billing_interval` nascem parametrizáveis mas ainda sem cobrança real.
-- Esta migration só acrescenta o rastro da cobrança (assinatura na Asaas +
-- eventos de webhook); ela NÃO decide preço de plano nenhum — isso continua
-- sendo um UPDATE em `plans`, feito fora de código.
--
-- `subscriptions` é 1:1 com uma assinatura recorrente na Asaas
-- (`asaas_subscription_id`), não com o plano do usuário — o plano vigente
-- continua sendo `user_profiles.plan_id` (fonte única, 073). O webhook é
-- quem sincroniza um a partir do outro.
--
-- `asaas_webhook_events` existe só pra dedup: a Asaas reenvia o mesmo evento
-- até receber 2xx, e reprocessar "PAYMENT_CONFIRMED" duas vezes não pode
-- duplicar efeito nenhum. Chave (payment_id, event) — o mesmo pagamento
-- dispara eventos diferentes ao longo da vida (CREATED, depois CONFIRMED);
-- só o evento IGUAL repetido é retry.
--
-- Idempotente.

alter table user_profiles add column if not exists asaas_customer_id text;
alter table user_profiles add column if not exists cpf_cnpj text;

create unique index if not exists idx_user_profiles_asaas_customer_id
  on user_profiles(asaas_customer_id) where asaas_customer_id is not null;

create table if not exists subscriptions (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references user_profiles(id) on delete cascade,
  plan_id              uuid not null references plans(id),
  asaas_subscription_id text not null unique,
  status               text not null default 'pending'
                         check (status in ('pending', 'active', 'overdue', 'canceled')),
  billing_type         text not null default 'UNDEFINED',
  next_due_date        date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_subscriptions_user on subscriptions(user_id);
create index if not exists idx_subscriptions_asaas_id on subscriptions(asaas_subscription_id);

drop trigger if exists trg_subscriptions_updated_at on subscriptions;
create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute procedure set_updated_at();

create table if not exists asaas_webhook_events (
  id           uuid primary key default uuid_generate_v4(),
  event        text not null,
  payment_id   text not null,
  payload      jsonb not null,
  processed_at timestamptz not null default now(),
  unique (payment_id, event)
);

-- ------------------------------------------------------------
-- RLS. Escrita nas duas tabelas só via service_role (rota de criação e
-- webhook usam createAdminClient, que bypassa RLS) — de propósito sem
-- policy de insert/update pro client comum: quem decide "assinatura ativa" é
-- a Asaas confirmando pagamento, nunca o navegador do usuário.
-- ------------------------------------------------------------
alter table subscriptions enable row level security;
alter table asaas_webhook_events enable row level security;

drop policy if exists subscriptions_select_own on subscriptions;
create policy subscriptions_select_own on subscriptions for select
  using (user_id = auth.uid() or auth_user_role() = 'admin');
