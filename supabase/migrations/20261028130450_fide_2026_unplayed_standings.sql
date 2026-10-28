-- FIDE tie-break regulations effective 2026-03-01, arts 7.5 and 16.
-- No results or points awarded are changed. Imported standings belong to
-- their external source and must not be overwritten by the native calculator.
-- No new columns/signatures: old clients remain compatible. No bulk backfill.
-- Rollback: restore the two function definitions from 20261024120000;
-- retain the execution restrictions from 20261024140000.

create or replace function public.sync_player_scores_from_standings(p_tournament_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with updated as (
    update public.tournament_players tp
       set current_score = s.points,
           current_rank = s.rank,
           buchholz = s.buchholz,
           buchholz_cut1 = s.buchholz_cut1,
           sonneborn_berger = s.sonneborn_berger,
           progressive = s.progressive
      from public.standings s
     where s.tournament_player_id = tp.id
       and tp.tournament_id = p_tournament_id
       and s.tournament_id = p_tournament_id
    returning 1
  )
  select count(*)::integer from updated;
$$;

create or replace function public.recalculate_standings(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.tournaments%rowtype;
  v_fide_swiss boolean;
  v_order_sql text;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if not found or v_t.mode = 'imported' then return; end if;
  v_fide_swiss := v_t.tournament_type = 'swiss';

  -- Results in different groups can change concurrently. Serialize the whole
  -- standings snapshot, not just the group currently launching a result.
  perform pg_advisory_xact_lock(hashtextextended('standings:' || p_tournament_id::text, 42));

  with participants as materialized (
    select tp.id as tp_id, tp.pairing_group_id,
           coalesce(pg.rounds_count, v_t.rounds_count) as total_rounds
      from public.tournament_players tp
      left join public.pairing_groups pg on pg.id = tp.pairing_group_id
     where tp.tournament_id = p_tournament_id
    -- Absent and withdrawn participants retain their complete history.
  ), horizons as (
    select p.pairing_group_id,
           coalesce(max(r.round_number) filter (where r.status in ('ongoing', 'finished')), 0) as last_round
      from (select distinct pairing_group_id from participants) p
      left join public.rounds r
        on r.tournament_id = p_tournament_id
       and r.pairing_group_id is not distinct from p.pairing_group_id
     group by p.pairing_group_id
  ), entries as materialized (
    select side.tp_id, side.opponent_id, r.round_number, p.result,
           p.is_bye, p.bye_kind, coalesce(side.points, 0) as points
      from public.pairings p
      join public.rounds r on r.id = p.round_id
      cross join lateral (values
        (p.white_tp_id, p.black_tp_id, p.white_points),
        (p.black_tp_id, p.white_tp_id, p.black_points)
      ) side(tp_id, opponent_id, points)
     where p.tournament_id = p_tournament_id
       and r.status in ('ongoing', 'finished')
       and side.tp_id is not null
  ), grid as (
    select p.tp_id, p.total_rounds, n.round_number, e.opponent_id,
           e.result, e.is_bye, e.bye_kind,
           coalesce(e.points, 0) as points,
           coalesce(e.result in ('1-0', '0-1', '1/2-1/2') and not e.is_bye, false) as played,
           case when e.result is not null then e.result <> '*'
                else coalesce(r.status::text, 'finished') = 'finished' end as known
      from participants p
      join horizons h on h.pairing_group_id is not distinct from p.pairing_group_id
      cross join lateral generate_series(1, h.last_round) n(round_number)
      left join public.rounds r
        on r.tournament_id = p_tournament_id
       and r.pairing_group_id is not distinct from p.pairing_group_id
       and r.round_number = n.round_number
      left join entries e on e.tp_id = p.tp_id and e.round_number = n.round_number
  ), classified as (
    select g.*,
           known and not played and (
             result is null
             or (is_bye and coalesce(bye_kind::text, 'pairing') not in ('pairing', 'round_robin'))
           ) as requested,
           known and result in ('forfeit_white', 'forfeit_black', 'double_forfeit') as forfeited
      from grid g
  ), voluntary as (
    select c.*, requested or (forfeited and points = 0) as vur
      from classified c
  ), timeline as materialized (
    select v.*,
           sum(case when known then points else 0 end) over (
             partition by tp_id order by round_number rows unbounded preceding
           ) as cumulative,
           count(*) filter (where known and not vur) over (
             partition by tp_id order by round_number
             rows between 1 following and unbounded following
           ) as later_available
      from voluntary v
  ), totals as materialized (
    select tp_id,
           sum(case when known then points else 0 end) as points,
           count(*) filter (where played)::smallint as games_played,
           count(*) filter (where played and points = 1)::smallint as wins,
           count(*) filter (where played and points = 0.5)::smallint as draws,
           count(*) filter (where played and points = 0)::smallint as losses,
           sum(cumulative) as progressive,
           -- Art 16.3: terminal requested byes become draws only in the score
           -- used for opponents' tie-breaks, never in the player's real score.
           sum(case when requested and later_available = 0 then 0.5
                    when known then points else 0 end) as adjusted
      from timeline group by tp_id
  ), contributions as (
    select r.tp_id, r.points, r.known, r.vur,
           r.known and (v_fide_swiss or r.opponent_id is not null) as eligible,
           case
             when not r.known then 0
             when not v_fide_swiss then coalesce(opp.points, 0)
             when r.played then coalesce(opp.adjusted, 0)
             -- Art 16.4.1: the dummy for a forfeit is capped by the
             -- scheduled opponent's adjusted score.
             when r.forfeited then least(own.points, opp.adjusted)
             -- Art 16.4.2: other unplayed rounds are capped at 50% of the
             -- group's scheduled rounds, including during interim standings.
             else least(own.points, r.total_rounds * 0.5)
           end as bh
      from timeline r
      join totals own on own.tp_id = r.tp_id
      left join totals opp on opp.tp_id = r.opponent_id
  ), tiebreaks as (
    select tp_id, sum(bh) as buchholz,
           sum(bh) - coalesce(
             -- Art 16.5: with a voluntary unplayed round, cut its lowest
             -- contribution rather than a lower contribution from a played game.
             min(bh) filter (where eligible and v_fide_swiss and vur),
             min(bh) filter (where eligible), 0
           ) as buchholz_cut1,
           sum(bh * points) as sonneborn_berger
      from contributions group by tp_id
  )
  insert into public.standings (
    tournament_id, tournament_player_id, points, games_played, wins, draws, losses,
    buchholz, buchholz_cut1, sonneborn_berger, progressive, updated_at
  )
  select p_tournament_id, p.tp_id, coalesce(s.points, 0), coalesce(s.games_played, 0),
         coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0),
         coalesce(tb.buchholz, 0), coalesce(tb.buchholz_cut1, 0),
         coalesce(tb.sonneborn_berger, 0), coalesce(s.progressive, 0), now()
    from participants p
    left join totals s on s.tp_id = p.tp_id
    left join tiebreaks tb on tb.tp_id = p.tp_id
  on conflict (tournament_id, tournament_player_id) do update set
    points = excluded.points, games_played = excluded.games_played,
    wins = excluded.wins, draws = excluded.draws, losses = excluded.losses,
    buchholz = excluded.buchholz, buchholz_cut1 = excluded.buchholz_cut1,
    sonneborn_berger = excluded.sonneborn_berger, progressive = excluded.progressive,
    updated_at = excluded.updated_at;

  select string_agg(col, ', ' order by ord) into v_order_sql
    from (
      select ord, case tb
        when 'buchholz' then 's.buchholz desc nulls last'
        when 'buchholz_cut1' then 's.buchholz_cut1 desc nulls last'
        when 'sonneborn_berger' then 's.sonneborn_berger desc nulls last'
        -- Existing key wins has always stored over-the-board wins (FIDE WON),
        -- not WIN, which would also include full-point byes and forfeit wins.
        when 'wins' then 's.wins desc nulls last'
        when 'progressive' then 's.progressive desc nulls last'
      end as col
      from unnest(v_t.tiebreak_order) with ordinality as keys(tb, ord)
    ) allowed where col is not null;
  v_order_sql := coalesce(v_order_sql,
    's.buchholz desc nulls last, s.buchholz_cut1 desc nulls last, s.sonneborn_berger desc nulls last');

  execute format(
    $rank$with ranked as (
      select s.tournament_player_id, row_number() over (
        partition by tp.pairing_group_id
        order by s.points desc, %s, tp.initial_ranking nulls last, tp.id
      ) as new_rank
      from public.standings s
      join public.tournament_players tp on tp.id = s.tournament_player_id
      where s.tournament_id = $1
    )
    update public.standings s set rank = r.new_rank from ranked r
     where s.tournament_player_id = r.tournament_player_id
       and s.tournament_id = $1$rank$, v_order_sql
  ) using p_tournament_id;
  perform public.sync_player_scores_from_standings(p_tournament_id);
end;
$$;

-- Keep the existing internal-only security boundary, including on fresh setup.
revoke all on function public.recalculate_standings(uuid) from public, anon, authenticated;
revoke all on function public.sync_player_scores_from_standings(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_standings(uuid) to service_role;
grant execute on function public.sync_player_scores_from_standings(uuid) to service_role;
