-- Published seats are immutable in the editor; every accepted result immediately
-- recalculates native standings, including corrections and clearing an ongoing game.
-- Same function signatures/ACLs. No historical backfill or imported standings writes.
-- Rollback: restore override_pairing_players from 030 and set_pairing_result from
-- 021, retaining search_path hardening from 20261023100000, and drop the policy below.

-- Normal clients must use the authorized RPC for published results; they cannot
-- bypass the editor's guard by updating the seats directly through the Data API.
-- Existing SELECT/INSERT/DELETE policies and external import/app writers are unchanged.
drop policy if exists pairings_update_native_draft_only on public.pairings;
create policy pairings_update_native_draft_only on public.pairings
as restrictive for update to authenticated
using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.mode <> 'native')
  or exists (select 1 from public.rounds r where r.id = round_id and r.status = 'draft' and r.published_at is null)
)
with check (
  exists (select 1 from public.tournaments t where t.id = tournament_id and t.mode <> 'native')
  or exists (select 1 from public.rounds r where r.id = round_id and r.status = 'draft' and r.published_at is null)
);

create or replace function public.override_pairing_players(
  p_round_id uuid, p_moves jsonb, p_justification text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_round rounds%rowtype;
  v_item jsonb;
  v_moves jsonb := '[]'::jsonb;
  v_white_name text;
  v_black_name text;
  v_board smallint;
  v_actor_name text;
  v_before uuid[];
  v_after uuid[];
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if not is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status <> 'draft' or v_round.published_at is not null then
    raise exception 'INVALID_STATE: o pareamento não pode ser alterado depois de publicar a rodada';
  end if;
  if not exists (select 1 from tournaments where id = v_round.tournament_id and mode = 'native') then
    raise exception 'INVALID_STATE: o pareamento pertence à fonte externa';
  end if;
  if p_justification is null or length(btrim(p_justification)) < 3 then
    raise exception 'JUSTIFICATION_REQUIRED: informe a justificativa da alteração';
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then raise exception 'INVALID_MOVES'; end if;
  if jsonb_array_length(p_moves) = 0 then raise exception 'INVALID_MOVES'; end if;

  perform 1 from pairings where round_id = p_round_id order by id for update;
  if exists (
    select 1 from jsonb_array_elements(p_moves) item
    left join pairings p on p.id = (item->>'pairing_id')::uuid and p.round_id = p_round_id
    where p.id is null or p.is_bye or nullif(item->>'white_tp', '') is null
      or nullif(item->>'black_tp', '') is null
      or item->>'white_tp' = item->>'black_tp'
  ) then raise exception 'INVALID_MOVES: selecione mesas com dois jogadores desta rodada'; end if;
  if (select count(*) from jsonb_array_elements(p_moves)) <>
     (select count(distinct item->>'pairing_id') from jsonb_array_elements(p_moves) item) then
    raise exception 'INVALID_MOVES: mesa repetida';
  end if;

  select array_agg(seat.tp_id order by seat.tp_id) into v_before
  from pairings p cross join lateral (values (p.white_tp_id), (p.black_tp_id)) seat(tp_id)
  where p.round_id = p_round_id and not p.is_bye;

  -- Release both selected seats inside this transaction before swapping, so
  -- the non-deferrable white/black uniqueness indexes do not reject a valid swap.
  update pairings set white_tp_id = null, black_tp_id = null
  where round_id = p_round_id and id in (
    select (item->>'pairing_id')::uuid from jsonb_array_elements(p_moves) item
  );
  for v_item in select * from jsonb_array_elements(p_moves) loop
    update pairings set
      white_tp_id = (v_item->>'white_tp')::uuid,
      black_tp_id = (v_item->>'black_tp')::uuid,
      manual_override = true, result = '*', white_points = null, black_points = null
    where id = (v_item->>'pairing_id')::uuid and round_id = p_round_id
    returning board_number into v_board;

    select p.full_name into v_white_name from tournament_players tp join players p on p.id = tp.player_id
      where tp.id = (v_item->>'white_tp')::uuid;
    select p.full_name into v_black_name from tournament_players tp join players p on p.id = tp.player_id
      where tp.id = (v_item->>'black_tp')::uuid;
    v_moves := v_moves || jsonb_build_object('board', v_board, 'white_name', v_white_name, 'black_name', v_black_name);
  end loop;
  select array_agg(seat.tp_id order by seat.tp_id) into v_after
  from pairings p cross join lateral (values (p.white_tp_id), (p.black_tp_id)) seat(tp_id)
  where p.round_id = p_round_id and not p.is_bye;
  if v_after is distinct from v_before then
    raise exception 'INVALID_MOVES: a alteração deve preservar todos os jogadores, sem duplicação';
  end if;

  select full_name into v_actor_name from user_profiles where id = auth.uid();
  perform _audit(v_round.tournament_id, 'override_pairing', 'round', p_round_id,
    jsonb_build_object('round_number', v_round.round_number,
      'justification', btrim(p_justification),
      'actor_name', coalesce(nullif(btrim(v_actor_name), ''), 'Organizador'), 'moves', v_moves));
end $$;

create or replace function public.set_pairing_result(p_pairing_id uuid, p_result game_result)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pairing pairings%rowtype;
  v_round rounds%rowtype;
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

  if v_pairing.board_number is not null and v_round.pairing_group_id is not null then
    select user_id into v_assigned from board_arbiters
    where pairing_group_id = v_round.pairing_group_id and board_number = v_pairing.board_number;
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
           when 'double_forfeit' then 0.0 else null end into v_w, v_b;
  update pairings set result = p_result, white_points = v_w, black_points = v_b where id = p_pairing_id;
  perform _audit(v_pairing.tournament_id, 'set_result', 'pairing', p_pairing_id,
    jsonb_build_object('board', v_pairing.board_number, 'before', v_pairing.result, 'after', p_result));

  -- Same transaction as the result: readers never see a confirmed result
  -- whose points, tiebreaks and rank still belong to the previous snapshot.
  perform recalculate_standings(v_pairing.tournament_id);
end $$;
