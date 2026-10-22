-- ============================================================
-- Alertas de torneios (plano de monetização, frente 4)
-- ============================================================
-- O usuário cadastra regras (estados + ritmos) e recebe aviso de torneios que
-- casam com elas, vindos de duas fontes:
--   - torneios do próprio site (tournaments públicos, ainda por começar);
--   - calendário oficial da CBX (cbx_calendar_events), espelhado uma vez por
--     dia pela rota /api/internal/tournament-alerts — a maioria dos torneios
--     só existe lá antes de começar.
-- Entrega: aviso no app (/alertas) sempre; push quando o aparelho autorizou.
-- tournament_alert_deliveries impede avisar duas vezes o mesmo torneio.
--
-- Gratuito com limite, pago sem limite: entitlement 'alerts.rules' (073).
-- Com a cobrança global desligada (082) não há limite.
--
-- Idempotente.

create table if not exists cbx_calendar_events (
  cbx_id        text primary key,           -- "10813/26"
  name          text not null,
  start_date    date not null,
  end_date      date not null,
  location      text,
  uf            text,                         -- sigla, quando o local traz
  time_control  text,                         -- 'std' | 'rpd' | 'blz' | null
  rating        text,                         -- "CBX e FIDE", "CBX"...
  organizer     text,
  status        text,                         -- "Pré-oficializado", "Provisório"...
  first_seen_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_cbx_calendar_start on cbx_calendar_events(start_date);

alter table cbx_calendar_events enable row level security;
drop policy if exists cbx_calendar_events_select_all on cbx_calendar_events;
create policy cbx_calendar_events_select_all on cbx_calendar_events for select using (true);

create table if not exists tournament_alert_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_profiles(id) on delete cascade,
  name          text,
  ufs           text[] not null default '{}',   -- vazio = todos os estados
  time_controls text[] not null default '{}',   -- vazio = todos os ritmos ('std','rpd','blz')
  include_cbx   boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint tournament_alert_rules_tc_valid check (time_controls <@ array['std', 'rpd', 'blz']::text[]),
  constraint tournament_alert_rules_ufs_len check (cardinality(ufs) <= 27)
);

create index if not exists idx_tournament_alert_rules_user on tournament_alert_rules(user_id);

alter table tournament_alert_rules enable row level security;
drop policy if exists tournament_alert_rules_own on tournament_alert_rules;
create policy tournament_alert_rules_own on tournament_alert_rules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Limite de regras ativas pelo plano (entitlement 'alerts.rules'). Contexto de
-- serviço (auth.uid() nulo) e admin passam, mesmo padrão de 073/078.
create or replace function enforce_alert_rule_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_count integer;
begin
  if auth.uid() is null or public.auth_user_role() = 'admin' then return new; end if;
  if not new.active then return new; end if;
  v_limit := public.entitlement_limit('alerts.rules');
  if v_limit is null then return new; end if;
  select count(*) into v_count from tournament_alert_rules
   where user_id = new.user_id and active and id <> new.id;
  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT: seu plano permite % alerta(s) ativo(s)', v_limit using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_alert_rule_limit on tournament_alert_rules;
create trigger trg_alert_rule_limit before insert or update on tournament_alert_rules
  for each row execute function enforce_alert_rule_limit();

create table if not exists tournament_alert_deliveries (
  rule_id      uuid not null references tournament_alert_rules(id) on delete cascade,
  source       text not null check (source in ('site', 'cbx')),
  ref_id       text not null,
  delivered_at timestamptz not null default now(),
  primary key (rule_id, source, ref_id)
);

alter table tournament_alert_deliveries enable row level security;
drop policy if exists tournament_alert_deliveries_own on tournament_alert_deliveries;
create policy tournament_alert_deliveries_own on tournament_alert_deliveries for select
  using (exists (select 1 from tournament_alert_rules r where r.id = rule_id and r.user_id = auth.uid()));

-- Gratuito: 1 alerta ativo. Demais planos: sem limite.
insert into plan_entitlements (plan_id, key, enabled, limit_int)
select p.id, 'alerts.rules', true, case when p.code = 'free' then 1 else null end
  from plans p
on conflict (plan_id, key) do nothing;

-- Controle do espelho diário do calendário da CBX (a rota interna se auto-limita).
insert into app_settings (key, value) values ('alerts_last_run_at', '"1970-01-01T00:00:00Z"')
on conflict (key) do nothing;
