-- O app Gambito Lite passou a se chamar Gambito Torneios (mesmo nome do site) na Play.
-- Só os textos visíveis de lite_publish mudam: a descrição automática do torneio publicado e o
-- organizador padrão quando a conta não tem nome. Recriada a partir da última definição
-- (20261021120000_gambito_lite_sync.sql) — nenhuma outra mudança.

create or replace function public.lite_publish(p_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lite   lite_tournaments;
  v_b      jsonb;
  v_t      jsonb;
  v_group  uuid := md5('lite-group:' || p_id::text)::uuid;
  v_owner_name text;
  v_rounds_total int;
  v_round_count int;
  v_open_rounds int;
  v_status tournament_status;
  v_slug   text;
  v_start  date;
  v_tiebreaks text[];
  v_gone   uuid[];
begin
  select * into v_lite from lite_tournaments where id = p_id;
  if not found then raise exception 'LITE_NOT_FOUND'; end if;
  v_b := v_lite.backup;
  v_t := v_b -> 'tournament';

  -- Mesmo id em tournaments vindo de outra origem (não deveria acontecer: UUID do app).
  if exists (select 1 from tournaments where id = p_id and (mode <> 'app' or created_by <> v_lite.owner_id)) then
    raise exception 'LITE_ID_CONFLICT';
  end if;

  select coalesce(nullif(full_name, ''), 'Gambito Torneios') into v_owner_name from user_profiles where id = v_lite.owner_id;
  v_owner_name := coalesce(v_owner_name, 'Gambito Torneios');

  v_rounds_total := greatest((v_t ->> 'roundsTotal')::int, 1);
  select count(*), count(*) filter (where not (r ->> 'finished')::boolean)
    into v_round_count, v_open_rounds
    from jsonb_array_elements(v_b -> 'rounds') r;
  v_status := case
    when v_round_count = 0 then 'published'
    when v_round_count >= v_rounds_total and v_open_rounds = 0 then 'finished'
    else 'ongoing'
  end;
  v_start := (to_timestamp((v_t ->> 'createdAt')::bigint / 1000.0) at time zone 'America/Sao_Paulo')::date;

  select coalesce(array_agg(x), '{}') into v_tiebreaks
    from unnest(string_to_array(v_t ->> 'tiebreaks', ',')) x
    where x = any (array['buchholz','buchholz_cut1','sonneborn_berger','wins','progressive']);
  if cardinality(v_tiebreaks) = 0 then v_tiebreaks := array['buchholz','buchholz_cut1','sonneborn_berger']; end if;

  insert into tournaments (
    id, slug, name, description, city, state, organizer_name, time_control, tournament_type,
    start_date, end_date, rounds_count, status, is_public, created_by, mode, initial_color,
    tiebreak_order, registration_closes_by_date
  ) values (
    p_id, p_slug, v_t ->> 'name', 'Torneio organizado com o app Gambito Torneios.', 'Não informado', '', v_owner_name, '',
    (v_t ->> 'type')::tournament_type, v_start, case when v_status = 'finished' then current_date end,
    v_rounds_total, v_status, true, v_lite.owner_id, 'app', coalesce(v_t ->> 'initialColor', 'white1')::initial_color,
    v_tiebreaks, false
  )
  on conflict (id) do update set
    name = excluded.name,
    tournament_type = excluded.tournament_type,
    rounds_count = excluded.rounds_count,
    status = excluded.status,
    is_public = true,
    end_date = case when excluded.status = 'finished' then coalesce(tournaments.end_date, current_date) end,
    initial_color = excluded.initial_color,
    tiebreak_order = excluded.tiebreak_order;

  select slug into v_slug from tournaments where id = p_id;

  insert into pairing_groups (id, tournament_id, name, sort_order)
  values (v_group, p_id, 'Absoluto', 0)
  on conflict (id) do nothing;

  -- Jogadores: players.id derivado do id do app; tournament_players.id = id do app.
  insert into players (id, full_name, birth_year, sex, rating_std, club_or_school, created_by, federation)
  select md5('lite-player:' || (p ->> 'id'))::uuid, p ->> 'name', (p ->> 'birthYear')::smallint,
         nullif(p ->> 'sex', '')::char, (p ->> 'rating')::smallint, p ->> 'club', v_lite.owner_id, null
    from jsonb_array_elements(v_b -> 'players') p
  on conflict (id) do update set
    full_name = excluded.full_name, birth_year = excluded.birth_year, sex = excluded.sex,
    rating_std = excluded.rating_std, club_or_school = excluded.club_or_school;

  -- Partidas antes dos jogadores: pairings referencia tournament_players sem cascade.
  delete from pairings where tournament_id = p_id
    and id not in (select (g ->> 'id')::uuid from jsonb_array_elements(v_b -> 'games') g);
  delete from rounds where tournament_id = p_id
    and id not in (select (r ->> 'id')::uuid from jsonb_array_elements(v_b -> 'rounds') r);
  -- Jogador apagado no app: sai do torneio e o cadastro criado para ele também (sem órfão na busca).
  with gone as (
    delete from tournament_players where tournament_id = p_id
      and id not in (select (p ->> 'id')::uuid from jsonb_array_elements(v_b -> 'players') p)
    returning player_id
  )
  select coalesce(array_agg(player_id), '{}') into v_gone from gone;
  delete from players pl where pl.id = any (v_gone) and pl.created_by = v_lite.owner_id
    and not exists (select 1 from tournament_players tp where tp.player_id = pl.id);

  insert into tournament_players (id, tournament_id, player_id, initial_ranking, status, pairing_group_id, joined_at_round, source_name)
  select (p ->> 'id')::uuid, p_id, md5('lite-player:' || (p ->> 'id'))::uuid, (p ->> 'startNo')::smallint,
         case when (p ->> 'active')::boolean then 'active' else 'withdrawn' end::player_tournament_status,
         v_group, coalesce((p ->> 'joinedAtRound')::smallint, 1), p ->> 'name'
    from jsonb_array_elements(v_b -> 'players') p
  on conflict (id) do update set
    initial_ranking = excluded.initial_ranking, status = excluded.status,
    joined_at_round = excluded.joined_at_round, source_name = excluded.source_name;

  -- Rodada já encerrada ao chegar não dispara push de "rodada publicada" (notified_at, 066).
  insert into rounds (id, tournament_id, round_number, status, published_at, pairing_group_id, notified_at)
  select (r ->> 'id')::uuid, p_id, (r ->> 'number')::smallint,
         case when (r ->> 'finished')::boolean then 'finished' else 'ongoing' end::round_status,
         to_timestamp((r ->> 'createdAt')::bigint / 1000.0), v_group,
         case when (r ->> 'finished')::boolean then now() end
    from jsonb_array_elements(v_b -> 'rounds') r
  on conflict (id) do update set status = excluded.status;

  insert into pairings (id, tournament_id, round_id, board_number, white_tp_id, black_tp_id, result,
                        white_points, black_points, is_bye, bye_kind)
  select (g ->> 'id')::uuid, p_id, (g ->> 'roundId')::uuid, (g ->> 'board')::smallint,
         (g ->> 'whiteId')::uuid, (g ->> 'blackId')::uuid, (g ->> 'result')::game_result,
         case
           when g ->> 'blackId' is null then case when g ->> 'byeKind' = 'round_robin' then 0 else 1 end
           when g ->> 'result' in ('1-0', 'forfeit_black') then 1
           when g ->> 'result' in ('0-1', 'forfeit_white', 'double_forfeit') then 0
           when g ->> 'result' = '1/2-1/2' then 0.5
         end,
         case
           when g ->> 'blackId' is null then null
           when g ->> 'result' in ('0-1', 'forfeit_white') then 1
           when g ->> 'result' in ('1-0', 'forfeit_black', 'double_forfeit') then 0
           when g ->> 'result' = '1/2-1/2' then 0.5
         end,
         g ->> 'blackId' is null, (g ->> 'byeKind')::bye_kind
    from jsonb_array_elements(v_b -> 'games') g
  on conflict (id) do update set
    board_number = excluded.board_number, white_tp_id = excluded.white_tp_id, black_tp_id = excluded.black_tp_id,
    result = excluded.result, white_points = excluded.white_points, black_points = excluded.black_points,
    is_bye = excluded.is_bye, bye_kind = excluded.bye_kind;

  -- Retirado sai da classificação no recálculo; a linha antiga dele ficaria parada lá.
  delete from standings s using tournament_players tp
    where s.tournament_id = p_id and tp.id = s.tournament_player_id and tp.status <> 'active';
  -- Duas passadas: recalculate_standings soma o Buchholz com current_score dos adversários,
  -- que ele mesmo atualiza jogador a jogador — numa carga do zero a 1ª passada lê zeros.
  perform recalculate_standings(p_id);
  perform recalculate_standings(p_id);

  update lite_tournaments set site_tournament_id = p_id where id = p_id;
  return v_slug;
end $$;

revoke all on function public.lite_publish(uuid, text) from public, anon, authenticated;

-- Torneios já publicados com a descrição automática antiga.
update public.tournaments
   set description = 'Torneio organizado com o app Gambito Torneios.'
 where mode = 'app' and description = 'Torneio organizado com o app Gambito Lite.';
