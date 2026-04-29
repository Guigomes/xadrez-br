-- ============================================================
-- Chess Viewer – Migration 003: SQL Functions & RPCs
-- ============================================================

-- ============================================================
-- recalculate_standings(p_tournament_id uuid)
-- Recalculates points, buchholz, buchholz cut-1, SB for all
-- players in a tournament. Call after inserting/updating results.
-- ============================================================

create or replace function recalculate_standings(p_tournament_id uuid)
returns void language plpgsql security definer as $$
declare
  v_tp record;
  v_points       numeric(5,1);
  v_buchholz     numeric(6,1);
  v_bh_cut1      numeric(6,1);
  v_sb           numeric(8,2);
  v_games_played smallint;
  v_wins         smallint;
  v_draws        smallint;
  v_losses       smallint;
begin
  -- Update current_score on tournament_players first
  for v_tp in
    select tp.id as tp_id
    from tournament_players tp
    where tp.tournament_id = p_tournament_id
      and tp.status = 'active'
  loop
    select
      coalesce(sum(
        case
          when p.white_tp_id = v_tp.tp_id then p.white_points
          when p.black_tp_id = v_tp.tp_id then p.black_points
          else 0
        end
      ), 0),
      count(case when p.result != '*' and p.result != 'bye' then 1 end)::smallint,
      count(case when (p.white_tp_id = v_tp.tp_id and p.result = '1-0')
                   or (p.black_tp_id = v_tp.tp_id and p.result = '0-1') then 1 end)::smallint,
      count(case when p.result = '1/2-1/2' then 1 end)::smallint,
      count(case when (p.white_tp_id = v_tp.tp_id and p.result = '0-1')
                   or (p.black_tp_id = v_tp.tp_id and p.result = '1-0') then 1 end)::smallint
    into v_points, v_games_played, v_wins, v_draws, v_losses
    from pairings p
    join rounds r on r.id = p.round_id
    where p.tournament_id = p_tournament_id
      and r.status = 'finished'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id);

    update tournament_players
    set current_score = coalesce(v_points, 0)
    where id = v_tp.tp_id;

    -- Buchholz = sum of opponents' scores
    select coalesce(sum(opp.current_score), 0)
    into v_buchholz
    from pairings p
    join rounds r on r.id = p.round_id
    join tournament_players opp
      on opp.id = case
        when p.white_tp_id = v_tp.tp_id then p.black_tp_id
        else p.white_tp_id
      end
    where p.tournament_id = p_tournament_id
      and r.status = 'finished'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
      and not p.is_bye;

    -- Buchholz Cut-1 = Buchholz minus lowest opponent score
    select coalesce(sum(opp.current_score), 0) - coalesce(min(opp.current_score), 0)
    into v_bh_cut1
    from pairings p
    join rounds r on r.id = p.round_id
    join tournament_players opp
      on opp.id = case
        when p.white_tp_id = v_tp.tp_id then p.black_tp_id
        else p.white_tp_id
      end
    where p.tournament_id = p_tournament_id
      and r.status = 'finished'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
      and not p.is_bye;

    -- Sonneborn-Berger = sum of (score of beaten opponents) + sum of (0.5 × score of drawn opponents)
    select coalesce(sum(
      case
        when (p.white_tp_id = v_tp.tp_id and p.result = '1-0') then opp.current_score
        when (p.black_tp_id = v_tp.tp_id and p.result = '0-1') then opp.current_score
        when p.result = '1/2-1/2' then opp.current_score * 0.5
        else 0
      end
    ), 0)
    into v_sb
    from pairings p
    join rounds r on r.id = p.round_id
    join tournament_players opp
      on opp.id = case
        when p.white_tp_id = v_tp.tp_id then p.black_tp_id
        else p.white_tp_id
      end
    where p.tournament_id = p_tournament_id
      and r.status = 'finished'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
      and not p.is_bye;

    -- Upsert into standings
    insert into standings (
      tournament_id, tournament_player_id,
      points, buchholz, buchholz_cut1, sonneborn_berger,
      games_played, wins, draws, losses, updated_at
    )
    values (
      p_tournament_id, v_tp.tp_id,
      coalesce(v_points, 0), v_buchholz, v_bh_cut1, v_sb,
      coalesce(v_games_played, 0),
      coalesce(v_wins, 0), coalesce(v_draws, 0), coalesce(v_losses, 0),
      now()
    )
    on conflict (tournament_id, tournament_player_id) do update set
      points             = excluded.points,
      buchholz           = excluded.buchholz,
      buchholz_cut1      = excluded.buchholz_cut1,
      sonneborn_berger   = excluded.sonneborn_berger,
      games_played       = excluded.games_played,
      wins               = excluded.wins,
      draws              = excluded.draws,
      losses             = excluded.losses,
      updated_at         = now();

  end loop;

  -- Update ranks
  with ranked as (
    select
      tournament_player_id,
      row_number() over (
        order by points desc, buchholz desc, buchholz_cut1 desc, sonneborn_berger desc
      ) as new_rank
    from standings
    where tournament_id = p_tournament_id
  )
  update standings s
  set rank = r.new_rank
  from ranked r
  where s.tournament_player_id = r.tournament_player_id
    and s.tournament_id = p_tournament_id;

  -- Keep tournament_players in sync
  update tournament_players tp
  set current_rank = s.rank,
      buchholz = s.buchholz,
      buchholz_cut1 = s.buchholz_cut1,
      sonneborn_berger = s.sonneborn_berger
  from standings s
  where s.tournament_player_id = tp.id
    and tp.tournament_id = p_tournament_id;
end;
$$;

-- ============================================================
-- get_tournament_standings(p_tournament_id uuid)
-- Returns full standings with player info
-- ============================================================

create or replace function get_tournament_standings(p_tournament_id uuid)
returns table (
  rank                  smallint,
  player_id             uuid,
  full_name             text,
  federation            text,
  state                 text,
  rating_std            smallint,
  initial_ranking       smallint,
  points                numeric(5,1),
  games_played          smallint,
  wins                  smallint,
  draws                 smallint,
  losses                smallint,
  buchholz              numeric(6,1),
  buchholz_cut1         numeric(6,1),
  sonneborn_berger      numeric(8,2),
  performance_rating    smallint,
  category_name         text,
  tp_id                 uuid,
  player_status         player_tournament_status
) language sql stable security definer as $$
  select
    s.rank,
    pl.id,
    pl.full_name,
    pl.federation,
    pl.state,
    pl.rating_std,
    tp.initial_ranking,
    s.points,
    s.games_played,
    s.wins,
    s.draws,
    s.losses,
    s.buchholz,
    s.buchholz_cut1,
    s.sonneborn_berger,
    s.performance_rating,
    cat.name,
    tp.id,
    tp.status
  from standings s
  join tournament_players tp on tp.id = s.tournament_player_id
  join players pl on pl.id = tp.player_id
  left join tournament_categories cat on cat.id = tp.category_id
  where s.tournament_id = p_tournament_id
  order by s.rank asc nulls last, s.points desc;
$$;

-- ============================================================
-- get_player_tournament_history(p_tournament_id, p_tp_id)
-- Returns round-by-round history for a specific player
-- ============================================================

create or replace function get_player_tournament_history(
  p_tournament_id uuid,
  p_tp_id         uuid
)
returns table (
  round_number   smallint,
  round_status   round_status,
  board_number   smallint,
  color          text,
  opponent_name  text,
  opponent_rating smallint,
  opponent_rank  smallint,
  result         game_result,
  points_earned  numeric(3,1),
  is_bye         boolean,
  cumulative_pts numeric(5,1)
) language sql stable security definer as $$
  select
    r.round_number,
    r.status,
    p.board_number,
    case when p.white_tp_id = p_tp_id then 'white' else 'black' end,
    coalesce(opp_pl.full_name, 'BYE'),
    opp_pl.rating_std,
    opp_tp.current_rank,
    p.result,
    case when p.white_tp_id = p_tp_id then p.white_points else p.black_points end,
    p.is_bye,
    sum(
      case when p2.white_tp_id = p_tp_id then p2.white_points else p2.black_points end
    ) over (order by r.round_number rows between unbounded preceding and current row)
  from pairings p
  join rounds r on r.id = p.round_id
  left join tournament_players opp_tp
    on opp_tp.id = case when p.white_tp_id = p_tp_id then p.black_tp_id else p.white_tp_id end
  left join players opp_pl on opp_pl.id = opp_tp.player_id
  -- for cumulative points
  join pairings p2 on p2.round_id = p.round_id
    and (p2.white_tp_id = p_tp_id or p2.black_tp_id = p_tp_id)
  where p.tournament_id = p_tournament_id
    and (p.white_tp_id = p_tp_id or p.black_tp_id = p_tp_id)
  order by r.round_number;
$$;

-- ============================================================
-- search_tournaments(query, state, status, limit, offset)
-- ============================================================

create or replace function search_tournaments(
  p_query  text    default null,
  p_state  text    default null,
  p_status tournament_status default null,
  p_limit  int     default 20,
  p_offset int     default 0
)
returns table (
  id             uuid,
  slug           text,
  name           text,
  city           text,
  state          text,
  start_date     date,
  end_date       date,
  status         tournament_status,
  tournament_type tournament_type,
  rounds_count   smallint,
  organizer_name text,
  time_control   text,
  player_count   bigint
) language sql stable security definer as $$
  select
    t.id, t.slug, t.name, t.city, t.state,
    t.start_date, t.end_date, t.status, t.tournament_type,
    t.rounds_count, t.organizer_name, t.time_control,
    count(tp.id)
  from tournaments t
  left join tournament_players tp on tp.tournament_id = t.id and tp.status = 'active'
  where t.is_public = true
    and t.status != 'draft'
    and (p_query  is null or t.name ilike '%' || p_query || '%' or t.city ilike '%' || p_query || '%')
    and (p_state  is null or lower(t.state) = lower(p_state))
    and (p_status is null or t.status = p_status)
  group by t.id
  order by t.start_date desc
  limit p_limit offset p_offset;
$$;

-- ============================================================
-- get_round_pairings(p_round_id uuid)
-- Returns pairings with player names for display
-- ============================================================

create or replace function get_round_pairings(p_round_id uuid)
returns table (
  pairing_id       uuid,
  board_number     smallint,
  white_tp_id      uuid,
  white_name       text,
  white_rating     smallint,
  white_rank       smallint,
  white_score      numeric(5,1),
  black_tp_id      uuid,
  black_name       text,
  black_rating     smallint,
  black_rank       smallint,
  black_score      numeric(5,1),
  result           game_result,
  white_points     numeric(3,1),
  black_points     numeric(3,1),
  is_bye           boolean
) language sql stable security definer as $$
  select
    p.id,
    p.board_number,
    wtp.id, wpl.full_name, wpl.rating_std, wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'), bpl.rating_std, btp.current_rank, btp.current_score,
    p.result, p.white_points, p.black_points, p.is_bye
  from pairings p
  join tournament_players wtp on wtp.id = p.white_tp_id
  join players wpl on wpl.id = wtp.player_id
  left join tournament_players btp on btp.id = p.black_tp_id
  left join players bpl on bpl.id = btp.player_id
  where p.round_id = p_round_id
  order by p.board_number asc nulls last;
$$;
