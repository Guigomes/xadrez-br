-- ============================================================
-- Chess Viewer - Migration 010: Per-pairing-group standings
-- ============================================================
-- Multi-group tournaments need an independent ranking per pairing group.
-- This migration:
--   * Partitions the rank computation in recalculate_standings by
--     pairing_group_id (NULL partition for single-group tournaments preserves
--     the previous behavior).
--   * Adds pairing_group_id / pairing_group_name to the standings RPC return
--     so the frontend can render one section per group.

-- ----------------------------------------------------------------
-- recalculate_standings — only the rank-assignment CTE changes.
-- ----------------------------------------------------------------
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

    insert into standings (
      tournament_id, tournament_player_id,
      points, buchholz, buchholz_cut1, sonneborn_berger,
      games_played, wins, draws, losses, updated_at
    )
    values (
      p_tournament_id, v_tp.tp_id,
      coalesce(v_points, 0), v_buchholz, v_bh_cut1, v_sb,
      coalesce(v_games_played, 0), coalesce(v_wins, 0),
      coalesce(v_draws, 0), coalesce(v_losses, 0),
      now()
    )
    on conflict (tournament_id, tournament_player_id)
    do update set
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

  -- Rank within each pairing group independently. NULL pairing_group_id forms
  -- a single partition, so tournaments without groups still get one global
  -- ranking exactly like before.
  with ranked as (
    select
      s.tournament_player_id,
      row_number() over (
        partition by tp.pairing_group_id
        order by s.points desc, s.buchholz desc, s.buchholz_cut1 desc, s.sonneborn_berger desc
      ) as new_rank
    from standings s
    join tournament_players tp on tp.id = s.tournament_player_id
    where s.tournament_id = p_tournament_id
  )
  update standings s
  set rank = r.new_rank
  from ranked r
  where s.tournament_player_id = r.tournament_player_id
    and s.tournament_id = p_tournament_id;

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

-- ----------------------------------------------------------------
-- get_tournament_standings — add pairing_group_id / name to the return.
-- ----------------------------------------------------------------
drop function if exists get_tournament_standings(uuid);

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
  pairing_group_id      uuid,
  pairing_group_name    text,
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
    pg.id,
    pg.name,
    tp.id,
    tp.status
  from standings s
  join tournament_players tp on tp.id = s.tournament_player_id
  join players pl on pl.id = tp.player_id
  left join tournament_categories cat on cat.id = tp.category_id
  left join pairing_groups pg on pg.id = tp.pairing_group_id
  where s.tournament_id = p_tournament_id
  order by pg.sort_order nulls last, s.rank asc nulls last, s.points desc;
$$;
