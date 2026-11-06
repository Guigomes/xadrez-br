-- Organizer-only launch: do not enable the global billing switch (reports,
-- player stats, alerts and the older plan gates remain unchanged).
-- User-approved price: BRL 19.99/month. Never reuse the older mock prices.
insert into public.plans (code, name, description, price_cents, billing_interval, is_public, sort_order)
values ('organizer', 'Organizador', 'Para organizar torneios com mais de 20 jogadores.', 1999, 'month', true, 2)
on conflict (code) do nothing;

insert into public.plan_entitlements (plan_id, key, enabled, limit_int)
select p.id, 'organizer.large_tournaments', p.code in ('organizer', 'plus', 'pro', 'federation'), null
from public.plans p
on conflict (plan_id, key) do nothing;

-- All other capabilities of the new plan inherit the current Pro matrix.
-- Only capacity is deliberately unlimited; no extra feature paywalls launch here.
insert into public.plan_entitlements (plan_id, key, enabled, limit_int)
select o.id, e.key, e.enabled,
  case when e.key = 'tournament.players' then null else e.limit_int end
from public.plans o cross join public.plan_entitlements e
join public.plans source on source.id = e.plan_id and source.code = 'pro'
where o.code = 'organizer'
on conflict (plan_id, key) do nothing;

update public.plan_entitlements e set limit_int = 20
from public.plans p where p.id = e.plan_id and p.code in ('free', 'player') and e.key = 'tournament.players';

insert into public.app_settings (key, value)
values ('organizer_billing_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- A retry or concurrent checkout must not register a second live recurrence.
-- Production currently has no subscriptions; never discard duplicates silently.
create unique index if not exists idx_subscriptions_one_live_plan
  on public.subscriptions(user_id, plan_id) where status in ('pending', 'active', 'overdue');

-- No public RPC and no new exposed table. Trigger privileges stay private.
create schema if not exists private;
create or replace function private.enforce_organizer_player_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner uuid;
  v_owner_role public.user_role;
  v_count integer;
begin
  if not coalesce((select value = 'true'::jsonb from public.app_settings where key = 'organizer_billing_enabled'), false) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.tournament_id = old.tournament_id then return new; end if;

  -- Serialize all additions on the same parent row, including approvals, bulk
  -- inserts and service callers. Two concurrent 21st players cannot both pass.
  select t.created_by into v_owner from public.tournaments t
    where t.id = new.tournament_id for update;
  if not found then return new; end if; -- the existing FK reports missing tournaments
  select u.role into v_owner_role from public.user_profiles u where u.id = v_owner;
  if v_owner_role = 'admin' or public.auth_user_role() = 'admin' then return new; end if;

  -- Never authorize by the caller's plan (staff may manage another person's
  -- tournament), by a checkout still pending, or merely by user_profiles.plan_id.
  if exists (
    select 1 from public.subscriptions s
    join public.plan_entitlements e on e.plan_id = s.plan_id
      and e.key = 'organizer.large_tournaments' and e.enabled
    where s.user_id = v_owner and s.status = 'active'
  ) then return new; end if;

  -- Count the entire roster, across pairing groups, including withdrawn players.
  -- Pending registrations are not yet participants. Existing matches/results and
  -- ordinary participant updates remain usable after expiry or a downgrade.
  select count(*) into v_count from public.tournament_players tp
    where tp.tournament_id = new.tournament_id;
  if v_count >= 20 then
    raise exception 'ORGANIZER_SUBSCRIPTION_REQUIRED: torneios com mais de 20 jogadores exigem uma assinatura ativa do organizador responsável. Acesse Planos para assinar ou regularizar o pagamento.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.enforce_organizer_player_limit() from public, anon, authenticated;
drop trigger if exists trg_organizer_player_limit on public.tournament_players;
create trigger trg_organizer_player_limit before insert or update of tournament_id on public.tournament_players
  for each row execute function private.enforce_organizer_player_limit();

-- Rollback without losing plans, subscriptions or participants:
-- UPDATE app_settings SET value='false'::jsonb WHERE key='organizer_billing_enabled';
-- Or remove only trg_organizer_player_limit and private.enforce_organizer_player_limit().
