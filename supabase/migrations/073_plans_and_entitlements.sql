-- ============================================================
-- Migration 073: planos de assinatura e liberação por funcionalidade
-- ============================================================
-- Um plano por usuário (user_profiles.plan_id). O que cada plano libera vive
-- em DADO (plan_entitlements), não em código: mudar o que o Plus dá é um
-- UPDATE, não um deploy. Preço e ciclo existem como coluna parametrizável e
-- NASCEM NULOS de propósito — ainda não foram decididos, e nada no sistema
-- depende deles pra liberar ou bloquear funcionalidade.
--
-- Dois formatos de regra por entitlement, porque existem dois tipos de limite:
--   enabled   = liga/desliga  (ex.: pode criar série?)
--   limit_int = teto numérico (ex.: quantos torneios ativos?) — null = sem teto
-- Linha ausente vale como "não liberado": plano novo nasce fechado e vai
-- abrindo, que é mais seguro que o contrário.
--
-- Idempotente.

-- ------------------------------------------------------------
-- Catálogo
-- ------------------------------------------------------------
create table if not exists plans (
  id               uuid primary key default uuid_generate_v4(),
  code             text not null unique,
  name             text not null,
  description      text,
  -- Parametrizáveis, ainda indefinidos: nada lê isso pra decidir permissão.
  -- `billing_interval` e não `interval` porque interval é nome de tipo no
  -- Postgres e vira ambiguidade em expressão.
  price_cents      integer,
  currency         text not null default 'BRL',
  billing_interval text,                        -- 'month' | 'year' | null
  is_public        boolean not null default true,
  sort_order       smallint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists plan_entitlements (
  plan_id   uuid not null references plans(id) on delete cascade,
  key       text not null,
  enabled   boolean not null default false,
  limit_int integer,                            -- null = sem teto
  primary key (plan_id, key)
);

create index if not exists idx_plan_entitlements_key on plan_entitlements(key);

-- ------------------------------------------------------------
-- Plano do usuário
-- ------------------------------------------------------------
alter table user_profiles add column if not exists plan_id uuid references plans(id);

-- ------------------------------------------------------------
-- Os quatro níveis. Nome é provisório; `code` é o que o sistema usa e é o
-- que não deve mudar à toa.
-- ------------------------------------------------------------
insert into plans (code, name, description, sort_order) values
  ('free',       'Gratuito',   'Um torneio por vez, turma pequena.',                    1),
  ('plus',       'Plus',       'Organiza com recorrência: faixas, árbitros, cobrança.', 2),
  ('pro',        'Pro',        'Festival multi-grupo, circuitos, marca própria.',       3),
  ('federation', 'Federações', 'Entidade com vários organizadores e temporada.',        4)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- A matriz. Reaplicar a migration re-sincroniza (on conflict do update): pra
-- corrigir o que um plano dá, edita aqui e roda de novo, ou faz UPDATE numa
-- linha só direto no banco. Nenhum dos dois caminhos exige deploy.
-- ------------------------------------------------------------
insert into plan_entitlements (plan_id, key, enabled, limit_int)
select p.id, v.key, v.enabled, v.limit_int
from plans p
join (values
  ('tournaments.active',   'free',       true,  1),
  ('tournaments.active',   'plus',       true,  5),
  ('tournaments.active',   'pro',        true,  null),
  ('tournaments.active',   'federation', true,  null),

  ('tournament.players',   'free',       true,  30),
  ('tournament.players',   'plus',       true,  150),
  ('tournament.players',   'pro',        true,  null),
  ('tournament.players',   'federation', true,  null),

  ('tournament.groups',    'free',       true,  1),
  ('tournament.groups',    'plus',       true,  4),
  ('tournament.groups',    'pro',        true,  null),
  ('tournament.groups',    'federation', true,  null),

  ('classification.bands', 'free',       false, null),
  ('classification.bands', 'plus',       true,  null),
  ('classification.bands', 'pro',        true,  null),
  ('classification.bands', 'federation', true,  null),

  ('registration.payment', 'free',       false, null),
  ('registration.payment', 'plus',       true,  null),
  ('registration.payment', 'pro',        true,  null),
  ('registration.payment', 'federation', true,  null),

  ('staff.delegate',       'free',       false, null),
  ('staff.delegate',       'plus',       true,  null),
  ('staff.delegate',       'pro',        true,  null),
  ('staff.delegate',       'federation', true,  null),

  ('notifications.push',   'free',       false, null),
  ('notifications.push',   'plus',       true,  null),
  ('notifications.push',   'pro',        true,  null),
  ('notifications.push',   'federation', true,  null),

  ('export.trf',           'free',       false, null),
  ('export.trf',           'plus',       true,  null),
  ('export.trf',           'pro',        true,  null),
  ('export.trf',           'federation', true,  null),

  ('series.enabled',       'free',       false, null),
  ('series.enabled',       'plus',       false, null),
  ('series.enabled',       'pro',        true,  null),
  ('series.enabled',       'federation', true,  null),

  ('import.chessresults',  'free',       false, null),
  ('import.chessresults',  'plus',       false, null),
  ('import.chessresults',  'pro',        true,  null),
  ('import.chessresults',  'federation', true,  null),

  ('branding.custom',      'free',       false, null),
  ('branding.custom',      'plus',       false, null),
  ('branding.custom',      'pro',        true,  null),
  ('branding.custom',      'federation', true,  null),

  ('support.priority',     'free',       false, null),
  ('support.priority',     'plus',       false, null),
  ('support.priority',     'pro',        true,  null),
  ('support.priority',     'federation', true,  null),

  ('account.multiuser',    'free',       false, null),
  ('account.multiuser',    'plus',       false, null),
  ('account.multiuser',    'pro',        false, null),
  ('account.multiuser',    'federation', true,  null)
) as v(key, plan_code, enabled, limit_int) on v.plan_code = p.code
on conflict (plan_id, key) do update
  set enabled = excluded.enabled, limit_int = excluded.limit_int;

-- Quem já existe (e quem nascer sem plano) fica no gratuito.
update user_profiles set plan_id = (select id from plans where code = 'free')
where plan_id is null;

-- ------------------------------------------------------------
-- Trocar plano exige admin — mesmo motivo e mesmo formato do
-- trg_prevent_role_escalation (026): sem isso qualquer conta se promove pra
-- 'pro' com um UPDATE direto e a régua inteira vira decoração.
-- auth.uid() nulo = contexto de serviço (script, webhook de pagamento na
-- fase de cobrança) — não bloqueado, é por ali que a cobrança vai mexer.
-- ------------------------------------------------------------
create or replace function prevent_plan_self_upgrade()
returns trigger language plpgsql security definer as $$
declare
  v_actor_role user_role;
begin
  if new.plan_id is distinct from old.plan_id then
    if auth.uid() is not null then
      select role into v_actor_role from user_profiles where id = auth.uid();
      if v_actor_role is distinct from 'admin' then
        raise exception 'FORBIDDEN: alterar plano exige admin' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_plan_self_upgrade on user_profiles;
create trigger trg_prevent_plan_self_upgrade
  before update on user_profiles
  for each row execute procedure prevent_plan_self_upgrade();

-- ------------------------------------------------------------
-- Leitura da régua — fonte única. Trigger, RPC e tela leem daqui; ninguém
-- recalcula a regra por conta própria (lição do selo de inscrições: regra
-- em dois lugares, um deles vira mentira).
-- ------------------------------------------------------------
create or replace function my_plan_id()
returns uuid language sql stable security definer as $$
  select plan_id from public.user_profiles where id = auth.uid();
$$;

/** Liberado? Admin passa por cima de tudo, como no resto do projeto. */
create or replace function has_entitlement(p_key text)
returns boolean language sql stable security definer as $$
  select case
    when public.auth_user_role() = 'admin' then true
    else coalesce(
      (select e.enabled from public.plan_entitlements e
        where e.plan_id = public.my_plan_id() and e.key = p_key),
      false)
  end;
$$;

/** Teto numérico. null = sem teto (inclui admin e chave sem limite). */
create or replace function entitlement_limit(p_key text)
returns integer language sql stable security definer as $$
  select case
    when public.auth_user_role() = 'admin' then null
    else (select e.limit_int from public.plan_entitlements e
           where e.plan_id = public.my_plan_id() and e.key = p_key)
  end;
$$;

/**
 * Tudo que a tela precisa numa chamada só: chave, se libera, teto e consumo.
 * `used` só é calculado onde contar faz sentido; no resto vem null.
 */
create or replace function get_my_entitlements()
returns table (key text, enabled boolean, limit_int integer, used integer)
language sql stable security definer as $$
  select
    e.key,
    case when public.auth_user_role() = 'admin' then true else e.enabled end,
    case when public.auth_user_role() = 'admin' then null else e.limit_int end,
    case e.key
      when 'tournaments.active' then (
        select count(*)::int from public.tournaments t
        where t.created_by = auth.uid()
          and t.status not in ('finished', 'cancelled')
      )
      else null
    end
  from public.plan_entitlements e
  where e.plan_id = public.my_plan_id();
$$;

-- ------------------------------------------------------------
-- Atribuição de plano: porta única de escrita, só admin. Enquanto não existe
-- cobrança, é assim que alguém muda de nível.
-- ------------------------------------------------------------
create or replace function set_user_plan(p_user_id uuid, p_plan_code text)
returns void language plpgsql security definer as $$
declare
  v_plan_id uuid;
begin
  if public.auth_user_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN: só admin troca plano' using errcode = '42501';
  end if;
  select id into v_plan_id from public.plans where code = p_plan_code;
  if v_plan_id is null then
    raise exception 'PLAN_NOT_FOUND: %', p_plan_code using errcode = '22023';
  end if;
  update public.user_profiles set plan_id = v_plan_id where id = p_user_id;
end $$;

-- ------------------------------------------------------------
-- Trava de volume: torneios ativos. É a camada que ninguém contorna — a tela
-- esconde o botão, mas quem chamar a API direto para aqui.
-- Conta só na CRIAÇÃO: torneio já em andamento nunca é afetado por plano.
-- ------------------------------------------------------------
create or replace function enforce_tournament_plan_limit()
returns trigger language plpgsql security definer as $$
declare
  v_limit integer;
  v_used  integer;
begin
  -- Contexto de serviço (script, seed) não é barrado.
  if auth.uid() is null then return new; end if;
  if public.auth_user_role() = 'admin' then return new; end if;

  select e.limit_int into v_limit
  from public.plan_entitlements e
  where e.plan_id = (select plan_id from public.user_profiles where id = new.created_by)
    and e.key = 'tournaments.active';

  if v_limit is null then return new; end if;  -- sem teto

  select count(*) into v_used from public.tournaments t
  where t.created_by = new.created_by
    and t.status not in ('finished', 'cancelled');

  if v_used >= v_limit then
    raise exception 'PLAN_LIMIT: seu plano permite % torneio(s) ativo(s) ao mesmo tempo', v_limit
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_tournament_plan_limit on tournaments;
create trigger trg_tournament_plan_limit
  before insert on tournaments
  for each row execute procedure enforce_tournament_plan_limit();

-- ------------------------------------------------------------
-- RLS: catálogo é leitura pública (a futura tela de planos precisa dele),
-- escrita só admin.
-- ------------------------------------------------------------
alter table plans enable row level security;
alter table plan_entitlements enable row level security;

drop policy if exists plans_select_all on plans;
create policy plans_select_all on plans for select using (true);

drop policy if exists plan_entitlements_select_all on plan_entitlements;
create policy plan_entitlements_select_all on plan_entitlements for select using (true);

drop policy if exists plans_write_admin on plans;
create policy plans_write_admin on plans for all
  using (auth_user_role() = 'admin') with check (auth_user_role() = 'admin');

drop policy if exists plan_entitlements_write_admin on plan_entitlements;
create policy plan_entitlements_write_admin on plan_entitlements for all
  using (auth_user_role() = 'admin') with check (auth_user_role() = 'admin');
