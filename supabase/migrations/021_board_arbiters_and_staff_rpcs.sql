-- ============================================================
-- Chess Viewer - Migration 021: Atribuição de mesas + RPCs de staff (F12/RF-10)
-- ============================================================
-- Atribuição por NÚMERO de mesa no grupo, persistente entre rodadas
-- (decisão do usuário). Idempotente.

create table if not exists board_arbiters (
  id                uuid primary key default uuid_generate_v4(),
  tournament_id     uuid not null references tournaments(id) on delete cascade,
  pairing_group_id  uuid not null references pairing_groups(id) on delete cascade,
  board_number      smallint not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  assigned_by       uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  unique (pairing_group_id, board_number)
);

create index if not exists idx_board_arbiters_group on board_arbiters (pairing_group_id);

alter table board_arbiters enable row level security;
drop policy if exists "board_arbiters: manager select" on board_arbiters;
create policy "board_arbiters: manager select"
  on board_arbiters for select using (is_tournament_manager(tournament_id));
-- escrita apenas via RPCs security definer

-- ------------------------------------------------------------
-- Papel do usuário no torneio ('organizer' inclui owner e admin global)
-- ------------------------------------------------------------
create or replace function get_my_tournament_role(p_tournament_id uuid)
returns text language sql stable security definer as $$
  select case
    when is_tournament_organizer(p_tournament_id) then 'organizer'
    when is_tournament_manager(p_tournament_id) then 'arbiter'
    else null end;
$$;

-- ------------------------------------------------------------
-- Staff: listagem com nome/e-mail (user_profiles tem RLS de self-read,
-- então a leitura é feita aqui, gated por manager)
-- ------------------------------------------------------------
create or replace function get_tournament_staff(p_tournament_id uuid)
returns table (id uuid, user_id uuid, role staff_role, full_name text, email text)
language sql stable security definer as $$
  select s.id, s.user_id, s.role, up.full_name, up.email
  from tournament_staff s
  join user_profiles up on up.id = s.user_id
  where s.tournament_id = p_tournament_id
    and is_tournament_manager(p_tournament_id);
$$;

create or replace function add_staff_by_email(
  p_tournament_id uuid, p_email text, p_role staff_role
) returns uuid language plpgsql security definer as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if not is_tournament_organizer(p_tournament_id) then raise exception 'FORBIDDEN'; end if;
  select id into v_user from user_profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'USER_NOT_FOUND: nenhuma conta com este e-mail — peça para a pessoa criar conta primeiro';
  end if;
  insert into tournament_staff (tournament_id, user_id, role, invited_by)
  values (p_tournament_id, v_user, p_role, auth.uid())
  on conflict (tournament_id, user_id) do update set role = excluded.role
  returning id into v_id;
  perform _audit(p_tournament_id, 'add_staff', 'staff', v_id,
    jsonb_build_object('role', p_role));
  return v_id;
end $$;

create or replace function remove_staff(p_staff_id uuid)
returns void language plpgsql security definer as $$
declare
  v_row tournament_staff%rowtype;
begin
  select * into v_row from tournament_staff where id = p_staff_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not is_tournament_organizer(v_row.tournament_id) then raise exception 'FORBIDDEN'; end if;
  delete from tournament_staff where id = p_staff_id;
  -- limpa mesas do removido neste torneio
  delete from board_arbiters where tournament_id = v_row.tournament_id and user_id = v_row.user_id;
  perform _audit(v_row.tournament_id, 'remove_staff', 'staff', p_staff_id, null);
end $$;

-- ------------------------------------------------------------
-- Atribuição de mesas
-- ------------------------------------------------------------
create or replace function assign_board_arbiter(
  p_group_id uuid, p_board_number smallint, p_user_id uuid
) returns void language plpgsql security definer as $$
declare
  v_t uuid;
  v_existing uuid;
begin
  select tournament_id into v_t from pairing_groups where id = p_group_id;
  if v_t is null then raise exception 'GROUP_NOT_FOUND'; end if;
  if not is_tournament_manager(v_t) then raise exception 'FORBIDDEN'; end if;

  -- alvo precisa ser staff (ou owner) do torneio
  if not (
    exists (select 1 from tournament_staff s where s.tournament_id = v_t and s.user_id = p_user_id)
    or exists (select 1 from tournaments t where t.id = v_t and t.created_by = p_user_id)
  ) then
    raise exception 'NOT_STAFF: usuário não faz parte do staff deste torneio';
  end if;

  select user_id into v_existing from board_arbiters
  where pairing_group_id = p_group_id and board_number = p_board_number;

  if not is_tournament_organizer(v_t) then
    -- árbitro: só auto-atribuição em mesa livre
    if p_user_id <> auth.uid() then raise exception 'FORBIDDEN: árbitro só assume mesa para si'; end if;
    if v_existing is not null then raise exception 'BOARD_TAKEN: mesa já tem árbitro'; end if;
  end if;

  insert into board_arbiters (tournament_id, pairing_group_id, board_number, user_id, assigned_by)
  values (v_t, p_group_id, p_board_number, p_user_id,
          case when p_user_id = auth.uid() then null else auth.uid() end)
  on conflict (pairing_group_id, board_number)
  do update set user_id = excluded.user_id, assigned_by = excluded.assigned_by, created_at = now();

  perform _audit(v_t, 'assign_board', 'board', null,
    jsonb_build_object('group', p_group_id, 'board', p_board_number, 'arbiter', p_user_id));
end $$;

create or replace function unassign_board_arbiter(p_group_id uuid, p_board_number smallint)
returns void language plpgsql security definer as $$
declare
  v_t uuid;
  v_existing uuid;
begin
  select tournament_id into v_t from pairing_groups where id = p_group_id;
  if v_t is null then raise exception 'GROUP_NOT_FOUND'; end if;
  select user_id into v_existing from board_arbiters
  where pairing_group_id = p_group_id and board_number = p_board_number;
  if v_existing is null then return; end if;
  if v_existing <> auth.uid() and not is_tournament_organizer(v_t) then
    raise exception 'FORBIDDEN: só o árbitro atribuído ou um organizador podem liberar a mesa';
  end if;
  delete from board_arbiters where pairing_group_id = p_group_id and board_number = p_board_number;
  perform _audit(v_t, 'unassign_board', 'board', null,
    jsonb_build_object('group', p_group_id, 'board', p_board_number));
end $$;

-- ------------------------------------------------------------
-- set_pairing_result: mesa atribuída só pelo árbitro dela ou organizador
-- (recria a função da 020 com a checagem extra)
-- ------------------------------------------------------------
create or replace function set_pairing_result(p_pairing_id uuid, p_result game_result)
returns void language plpgsql security definer as $$
declare
  v_pairing pairings%rowtype;
  v_round   rounds%rowtype;
  v_assigned uuid;
  v_w numeric(3,1);
  v_b numeric(3,1);
begin
  select * into v_pairing from pairings where id = p_pairing_id for update;
  if not found then raise exception 'PAIRING_NOT_FOUND'; end if;
  select * into v_round from rounds where id = v_pairing.round_id;

  if not is_tournament_manager(v_pairing.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status = 'draft' then raise exception 'INVALID_STATE: rodada ainda não publicada'; end if;
  if v_pairing.is_bye then raise exception 'INVALID_STATE: bye não recebe resultado'; end if;
  if p_result = 'bye' then raise exception 'INVALID_RESULT'; end if;
  if p_result = '*' and v_round.status = 'finished' then
    raise exception 'INVALID_STATE: use reopen_round para reabrir a rodada';
  end if;

  -- RF-10: mesa atribuída → só o árbitro dela ou organizador
  if v_pairing.board_number is not null and v_round.pairing_group_id is not null then
    select user_id into v_assigned from board_arbiters
    where pairing_group_id = v_round.pairing_group_id
      and board_number = v_pairing.board_number;
    if v_assigned is not null and v_assigned <> auth.uid()
       and not is_tournament_organizer(v_pairing.tournament_id) then
      raise exception 'BOARD_ASSIGNED: esta mesa é atendida por outro árbitro';
    end if;
  end if;

  select case p_result
           when '1-0' then 1.0 when '0-1' then 0.0 when '1/2-1/2' then 0.5
           when 'forfeit_white' then 0.0 when 'forfeit_black' then 1.0
           when 'double_forfeit' then 0.0 else null end,
         case p_result
           when '1-0' then 0.0 when '0-1' then 1.0 when '1/2-1/2' then 0.5
           when 'forfeit_white' then 1.0 when 'forfeit_black' then 0.0
           when 'double_forfeit' then 0.0 else null end
  into v_w, v_b;

  update pairings set result = p_result, white_points = v_w, black_points = v_b
  where id = p_pairing_id;

  perform _audit(v_pairing.tournament_id, 'set_result', 'pairing', p_pairing_id,
    jsonb_build_object('board', v_pairing.board_number,
                       'before', v_pairing.result, 'after', p_result));

  if v_round.status = 'finished' then
    perform recalculate_standings(v_pairing.tournament_id);
  end if;
end $$;
