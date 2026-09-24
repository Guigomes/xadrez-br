-- ============================================================
-- Migration 082: interruptor global de cobrança (tudo gratuito, temporário)
-- ============================================================
-- Decisão do dono (2026-09-24): enquanto o sistema não lança, tudo é
-- gratuito. Em vez de apagar a régua de planos (073) ou reescrever a matriz
-- plan_entitlements (e ter que lembrar de restaurar depois), um interruptor
-- só: com `billing_enabled = false`, toda leitura da régua trata qualquer
-- usuário como o admin já era tratado — tudo liberado, sem teto. A matriz
-- continua intacta, pronta pra voltar a valer.
--
-- VOLTAR A COBRAR:
--   update app_settings set value = 'true' where key = 'billing_enabled';
-- (a tela /planos, o checkout e a API de assinatura voltam junto — o app lê
-- o mesmo interruptor via billing_enabled()).
--
-- Linha ausente = cobrança LIGADA (comportamento de antes desta migration):
-- apagar a linha por engano fecha em vez de abrir.
--
-- Idempotente.

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists app_settings_select_all on app_settings;
create policy app_settings_select_all on app_settings for select using (true);

drop policy if exists app_settings_write_admin on app_settings;
create policy app_settings_write_admin on app_settings for all
  using (auth_user_role() = 'admin') with check (auth_user_role() = 'admin');

-- `do nothing`: reaplicar a migration não pode religar/desligar por acidente
-- um interruptor que alguém já mexeu à mão.
insert into app_settings (key, value) values ('billing_enabled', 'false')
on conflict (key) do nothing;

create or replace function billing_enabled()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select (value #>> '{}')::boolean from public.app_settings where key = 'billing_enabled'),
    true);
$$;

grant execute on function billing_enabled() to anon, authenticated;

-- ------------------------------------------------------------
-- Régua (073) com o interruptor. Com cobrança ligada, idêntico ao original.
-- ------------------------------------------------------------
create or replace function has_entitlement(p_key text)
returns boolean language sql stable security definer as $$
  select case
    when public.auth_user_role() = 'admin' or not public.billing_enabled() then true
    else coalesce(
      (select e.enabled from public.plan_entitlements e
        where e.plan_id = public.my_plan_id() and e.key = p_key),
      false)
  end;
$$;

create or replace function entitlement_limit(p_key text)
returns integer language sql stable security definer as $$
  select case
    when public.auth_user_role() = 'admin' or not public.billing_enabled() then null
    else (select e.limit_int from public.plan_entitlements e
           where e.plan_id = public.my_plan_id() and e.key = p_key)
  end;
$$;

-- Com cobrança desligada lista TODAS as chaves conhecidas (não só as do plano
-- do usuário): conta sem plan_id atribuído voltaria vazia e a tela leria
-- "nada liberado".
create or replace function get_my_entitlements()
returns table (key text, enabled boolean, limit_int integer, used integer)
language sql stable security definer as $$
  with keys as (
    select e.key,
      case when public.auth_user_role() = 'admin' then true else e.enabled end as enabled,
      case when public.auth_user_role() = 'admin' then null else e.limit_int end as limit_int
    from public.plan_entitlements e
    where public.billing_enabled() and e.plan_id = public.my_plan_id()
    union all
    select distinct e.key, true, null::integer
    from public.plan_entitlements e
    where not public.billing_enabled()
  )
  select k.key, k.enabled, k.limit_int,
    case k.key
      when 'tournaments.active' then (
        select count(*)::int from public.tournaments t
        where t.created_by = auth.uid()
          and t.status not in ('finished', 'cancelled')
      )
      else null
    end
  from keys k;
$$;

create or replace function enforce_tournament_plan_limit()
returns trigger language plpgsql security definer as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if auth.uid() is null then return new; end if;
  if public.auth_user_role() = 'admin' then return new; end if;
  if not public.billing_enabled() then return new; end if;

  select e.limit_int into v_limit
  from public.plan_entitlements e
  where e.plan_id = (select plan_id from public.user_profiles where id = new.created_by)
    and e.key = 'tournaments.active';

  if v_limit is null then return new; end if;

  select count(*) into v_used from public.tournaments t
  where t.created_by = new.created_by
    and t.status not in ('finished', 'cancelled');

  if v_used >= v_limit then
    raise exception 'PLAN_LIMIT: seu plano permite % torneio(s) ativo(s) ao mesmo tempo', v_limit
      using errcode = 'P0001';
  end if;
  return new;
end $$;
