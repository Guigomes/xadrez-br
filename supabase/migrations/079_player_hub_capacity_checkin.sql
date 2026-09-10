-- Migration 079: Player Hub foundation: capacity/waitlist, account-player links and check-in.
-- Expand-only and backwards compatible: all new tournament behaviour is opt-in.

alter table tournaments add column if not exists max_participants integer
  check (max_participants is null or max_participants > 0);
alter table tournaments add column if not exists waitlist_enabled boolean not null default false;
alter table tournaments add column if not exists checkin_enabled boolean not null default false;
alter table tournaments add column if not exists checkin_opens_at timestamptz;
alter table tournaments add column if not exists checkin_closes_at timestamptz;

alter table tournaments drop constraint if exists tournaments_waitlist_requires_capacity;
alter table tournaments add constraint tournaments_waitlist_requires_capacity
  check (not waitlist_enabled or max_participants is not null);
alter table tournaments drop constraint if exists tournaments_checkin_window;
alter table tournaments add constraint tournaments_checkin_window
  check (checkin_opens_at is null or checkin_closes_at is null or checkin_opens_at <= checkin_closes_at);

alter table tournament_registrations add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table tournament_registrations add column if not exists is_waitlisted boolean not null default false;
alter table tournament_registrations add column if not exists waitlisted_at timestamptz;
alter table tournament_registrations add column if not exists promoted_at timestamptz;
create index if not exists idx_registrations_waitlist
  on tournament_registrations(tournament_id, created_at)
  where is_waitlisted and status = 'pending';
create index if not exists idx_registrations_user on tournament_registrations(user_id) where user_id is not null;

alter table tournament_players add column if not exists checkin_status text not null default 'not_required'
  check (checkin_status in ('not_required', 'pending', 'checked_in', 'absent'));
alter table tournament_players add column if not exists checked_in_at timestamptz;

create table if not exists user_player_links (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  evidence_tournament_id uuid references tournaments(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, player_id)
);
create unique index if not exists idx_user_player_one_verified
  on user_player_links(user_id) where status = 'verified';
create index if not exists idx_user_player_player on user_player_links(player_id);
drop trigger if exists trg_user_player_links_updated_at on user_player_links;
create trigger trg_user_player_links_updated_at before update on user_player_links
  for each row execute procedure set_updated_at();
alter table user_player_links enable row level security;

drop policy if exists "player links: user reads own" on user_player_links;
create policy "player links: user reads own" on user_player_links for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "player links: user requests own" on user_player_links;
create policy "player links: user requests own" on user_player_links for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');
drop policy if exists "player links: organizer reviews" on user_player_links;
create policy "player links: organizer reviews" on user_player_links for update to authenticated
  using (evidence_tournament_id is not null and is_tournament_manager(evidence_tournament_id))
  with check (evidence_tournament_id is not null and is_tournament_manager(evidence_tournament_id));

-- The authenticated account is attached server-side; anonymous registrations remain supported.
create or replace function set_registration_user()
returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists trg_registration_user on tournament_registrations;
create trigger trg_registration_user before insert on tournament_registrations
  for each row execute procedure set_registration_user();

-- Serialize registration allocation on the tournament row so the last seat cannot be oversold.
create or replace function allocate_registration_capacity()
returns trigger language plpgsql as $$
declare
  v_t tournaments%rowtype;
  v_reserved integer;
begin
  select * into v_t from tournaments where id = new.tournament_id for update;
  if v_t.max_participants is null then
    new.is_waitlisted := false;
    new.waitlisted_at := null;
    return new;
  end if;

  select
    (select count(*) from tournament_players tp where tp.tournament_id = new.tournament_id and tp.status = 'active')
    +
    (select count(*) from tournament_registrations r where r.tournament_id = new.tournament_id
      and r.status = 'pending' and not r.is_waitlisted)
  into v_reserved;

  if v_reserved >= v_t.max_participants then
    if not v_t.waitlist_enabled then
      raise exception 'TOURNAMENT_FULL: limite de participantes atingido' using errcode = 'P0001';
    end if;
    new.is_waitlisted := true;
    new.waitlisted_at := now();
  else
    new.is_waitlisted := false;
    new.waitlisted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_aa_registration_capacity on tournament_registrations;
create trigger trg_aa_registration_capacity before insert on tournament_registrations
  for each row execute procedure allocate_registration_capacity();

create or replace function enforce_capacity_updates()
returns trigger language plpgsql as $$
declare v_reserved integer;
begin
  if tg_table_name = 'tournament_registrations' then
    if new.status = 'approved' and new.is_waitlisted then
      raise exception 'WAITLIST_NOT_PROMOTED: promova a inscrição antes de aprovar' using errcode='P0001';
    end if;
    return new;
  end if;
  if new.max_participants is not null then
    select
      (select count(*) from tournament_players tp where tp.tournament_id = new.id and tp.status = 'active')
      +
      (select count(*) from tournament_registrations r where r.tournament_id = new.id
        and r.status = 'pending' and not r.is_waitlisted)
    into v_reserved;
    if new.max_participants < v_reserved then
      raise exception 'CAPACITY_BELOW_RESERVED: há % vagas ocupadas ou reservadas', v_reserved using errcode='P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_tournament_capacity_guard on tournaments;
create trigger trg_tournament_capacity_guard before update of max_participants on tournaments
  for each row execute procedure enforce_capacity_updates();
drop trigger if exists trg_registration_waitlist_guard on tournament_registrations;
create trigger trg_registration_waitlist_guard before update of status on tournament_registrations
  for each row execute procedure enforce_capacity_updates();

-- Waitlisted registrations are never charged until promoted.
create or replace function enforce_registration_payment_status()
returns trigger language plpgsql as $$
declare v_t tournaments%rowtype;
begin
  select * into v_t from tournaments where id = new.tournament_id;
  new.asaas_customer_id := null;
  new.asaas_payment_id := null;
  new.asaas_invoice_url := null;
  if new.is_waitlisted then
    new.payment_status := 'not_required';
  elsif v_t.accept_online_payment and not v_t.is_free then
    if v_t.registration_fee_cents is null or v_t.registration_fee_cents <= 0 then
      raise exception 'REGISTRATION_FEE_NOT_SET' using errcode = '23514';
    end if;
    if nullif(trim(new.cpf_cnpj), '') is null then raise exception 'CPF_CNPJ_REQUIRED' using errcode = '23514'; end if;
    if nullif(trim(new.email), '') is null then raise exception 'EMAIL_REQUIRED' using errcode = '23514'; end if;
    new.payment_status := 'pending';
  else
    new.payment_status := 'not_required';
  end if;
  return new;
end $$;

create or replace function promote_tournament_waitlist(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_t tournaments%rowtype; v_reserved integer; v_promoted integer := 0; v_row record;
begin
  select * into v_t from tournaments where id = p_tournament_id for update;
  select
    (select count(*) from tournament_players tp where tp.tournament_id = p_tournament_id and tp.status = 'active')
    +
    (select count(*) from tournament_registrations r where r.tournament_id = p_tournament_id
      and r.status = 'pending' and not r.is_waitlisted)
  into v_reserved;
  for v_row in select id from tournament_registrations
    where tournament_id = p_tournament_id and status = 'pending' and is_waitlisted
    order by created_at for update
  loop
    exit when v_t.max_participants is not null and v_reserved >= v_t.max_participants;
    update tournament_registrations set is_waitlisted = false, waitlisted_at = null,
      promoted_at = now(),
      payment_status = case when v_t.accept_online_payment and not v_t.is_free then 'pending' else 'not_required' end
      where id = v_row.id;
    v_reserved := v_reserved + 1; v_promoted := v_promoted + 1;
  end loop;
  return v_promoted;
end $$;
revoke all on function promote_tournament_waitlist(uuid) from public, anon, authenticated;

create or replace function maintain_waitlist_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'tournaments' then perform promote_tournament_waitlist(new.id);
  elsif old.status in ('pending','approved') and not old.is_waitlisted
    and (new.status = 'rejected' or new.is_waitlisted) then
    perform promote_tournament_waitlist(new.tournament_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_tournament_capacity_changed on tournaments;
create trigger trg_tournament_capacity_changed after update of max_participants on tournaments
  for each row execute procedure maintain_waitlist_after_change();
drop trigger if exists trg_registration_releases_seat on tournament_registrations;
create trigger trg_registration_releases_seat after update of status, is_waitlisted on tournament_registrations
  for each row execute procedure maintain_waitlist_after_change();

create or replace function maintain_waitlist_after_player_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    perform promote_tournament_waitlist(new.tournament_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_player_releases_seat on tournament_players;
create trigger trg_player_releases_seat after update of status on tournament_players
  for each row execute procedure maintain_waitlist_after_player_change();

-- Approved authenticated registrations establish a verified account-player link.
create or replace function link_approved_registration_player()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and new.user_id is not null and new.player_id is not null then
    insert into user_player_links(user_id, player_id, status, evidence_tournament_id, reviewed_by, reviewed_at)
    values(new.user_id, new.player_id, 'verified', new.tournament_id, new.approved_by, now())
    on conflict(user_id, player_id) do update set status='verified', reviewed_by=excluded.reviewed_by, reviewed_at=now();
  end if;
  return new;
end $$;
drop trigger if exists trg_link_approved_registration on tournament_registrations;
create trigger trg_link_approved_registration after update of status, player_id on tournament_registrations
  for each row execute procedure link_approved_registration_player();

-- A presenca nasce pendente apenas quando o torneio usa check-in. Importacoes e
-- torneios sem essa opcao preservam o comportamento anterior.
create or replace function initialize_player_checkin()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from tournaments where id = new.tournament_id and checkin_enabled) then
    new.checkin_status := 'pending';
  else
    new.checkin_status := 'not_required';
  end if;
  new.checked_in_at := null;
  return new;
end $$;
drop trigger if exists trg_initialize_player_checkin on tournament_players;
create trigger trg_initialize_player_checkin before insert on tournament_players
  for each row execute procedure initialize_player_checkin();

create or replace function sync_tournament_checkin_status()
returns trigger language plpgsql as $$
begin
  if new.checkin_enabled and not old.checkin_enabled then
    update tournament_players set checkin_status='pending', checked_in_at=null
      where tournament_id=new.id and checkin_status='not_required';
  elsif not new.checkin_enabled and old.checkin_enabled then
    update tournament_players set checkin_status='not_required', checked_in_at=null
      where tournament_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_tournament_checkin on tournaments;
create trigger trg_sync_tournament_checkin after update of checkin_enabled on tournaments
  for each row execute procedure sync_tournament_checkin_status();

create or replace function set_my_checkin(p_tournament_player_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_t tournaments%rowtype; v_player uuid; v_now timestamptz := now();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select tp.player_id into v_player from tournament_players tp
    where tp.id = p_tournament_player_id;
  select t.* into v_t from tournaments t
    join tournament_players tp on tp.tournament_id = t.id
    where tp.id = p_tournament_player_id;
  if v_player is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from user_player_links where user_id=v_user and player_id=v_player and status='verified') then
    raise exception 'PLAYER_NOT_LINKED' using errcode='42501';
  end if;
  if not v_t.checkin_enabled then raise exception 'CHECKIN_DISABLED' using errcode='P0001'; end if;
  if v_t.checkin_opens_at is not null and v_now < v_t.checkin_opens_at then raise exception 'CHECKIN_NOT_OPEN' using errcode='P0001'; end if;
  if v_t.checkin_closes_at is not null and v_now > v_t.checkin_closes_at then raise exception 'CHECKIN_CLOSED' using errcode='P0001'; end if;
  update tournament_players set checkin_status='checked_in', checked_in_at=v_now where id=p_tournament_player_id;
  return v_now;
end $$;
revoke all on function set_my_checkin(uuid) from public, anon;
grant execute on function set_my_checkin(uuid) to authenticated;

create or replace function set_player_checkin(p_tournament_player_id uuid, p_checked_in boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_tournament_id uuid; v_checked_at timestamptz;
begin
  select tournament_id into v_tournament_id from tournament_players where id=p_tournament_player_id;
  if v_tournament_id is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if not is_tournament_manager(v_tournament_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  v_checked_at := case when p_checked_in then now() else null end;
  update tournament_players set
    checkin_status=case when p_checked_in then 'checked_in' else 'pending' end,
    checked_in_at=v_checked_at
  where id=p_tournament_player_id;
  return v_checked_at;
end $$;
revoke all on function set_player_checkin(uuid, boolean) from public, anon;
grant execute on function set_player_checkin(uuid, boolean) to authenticated;

grant select, insert, update on user_player_links to authenticated;

-- Safe legacy backfill: federation identifiers are unique identity evidence.
insert into user_player_links(user_id, player_id, status, reviewed_at)
select up.id, p.id, 'verified', now()
from user_profiles up
join players p on (
  (nullif(up.cbx_id, '') is not null and p.cbx_id = up.cbx_id)
  or (nullif(up.fide_id, '') is not null and p.fide_id = up.fide_id)
)
where not exists(select 1 from user_player_links l where l.user_id = up.id and l.status = 'verified')
on conflict(user_id, player_id) do nothing;
