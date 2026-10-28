-- ============================================================
-- Rating mostrado em torneio: o do ritmo SÓ no nativo; importado/app usa rating_std
-- ============================================================
-- Correção da 20261028180000 e ajuste do detalhamento do jogador (pedido do dono, 2026-10-28:
-- "no detalhamento do jogador não está o rating certo").
--
-- 1. Torneio importado e do app gravam o rating da fonte em players.rating_std, qualquer que
--    seja o ritmo (mesma regra de participants-view.tsx). A 20261028180000 escolhia a coluna só
--    por tournaments.rating_kind, então num importado de ritmo rápido o rating_tempo vinha do
--    rating_rpd (vazio) em vez do rating da fonte. Agora: nativo = rating_kind; demais = std.
-- 2. get_player_tournament_history devolvia opponent_rating sempre de rating_std — num torneio
--    rápido o adversário aparecia com o rating clássico. Passa a usar o mesmo critério.
--
-- Mesmas assinaturas: `create or replace`, grants mantidos. Idempotente.

create or replace function public.get_tournament_standings(p_tournament_id uuid)
returns table(
  rank smallint, player_id uuid, full_name text, federation text, state text,
  rating_std smallint, initial_ranking smallint, points numeric, games_played smallint,
  wins smallint, draws smallint, losses smallint, buchholz numeric, buchholz_cut1 numeric,
  sonneborn_berger numeric, progressive numeric, performance_rating smallint,
  category_name text, category_id uuid, pairing_group_id uuid, pairing_group_name text,
  tp_id uuid, player_status player_tournament_status, title text, sex text, fide_name text,
  rating_tempo smallint
)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (
    select case when mode = 'native' then rating_kind::text else 'std' end as rating_kind,
      not exists (select 1 from rounds r where r.tournament_id = p_tournament_id and r.status <> 'draft') as pre_start
    from tournaments where id = p_tournament_id
  ), base as (
    select tp.id, tp.pairing_group_id, tp.created_at, pl.full_name,
      case t.rating_kind when 'std' then pl.rating_std when 'rpd' then pl.rating_rpd when 'blz' then pl.rating_blz end as rk
    from tournament_players tp
    join players pl on pl.id = tp.player_id
    cross join t
    where tp.tournament_id = p_tournament_id and tp.status = 'active'
  ), prev as (
    select id, row_number() over (
      partition by pairing_group_id
      order by rk desc nulls last, case when rk is null then created_at end asc, full_name asc, id
    )::smallint as rn
    from base
  )
  select
    coalesce(s.rank, tp.initial_ranking, case when t.pre_start then prev.rn end),
    pl.id, pl.full_name, pl.federation, pl.state, pl.rating_std,
    tp.initial_ranking, coalesce(s.points, 0), coalesce(s.games_played, 0),
    coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0),
    s.buchholz, s.buchholz_cut1, s.sonneborn_berger, s.progressive, s.performance_rating,
    cat.name, cat.id, pg.id, pg.name, tp.id, tp.status, pl.title, pl.sex::text, pl.fide_name,
    case t.rating_kind when 'std' then pl.rating_std when 'rpd' then pl.rating_rpd when 'blz' then pl.rating_blz end
  from tournament_players tp
  join players pl on pl.id = tp.player_id
  cross join t
  left join prev on prev.id = tp.id
  left join standings s on s.tournament_player_id = tp.id and s.tournament_id = p_tournament_id
  left join tournament_categories cat on cat.id = tp.category_id
  left join pairing_groups pg on pg.id = tp.pairing_group_id
  where tp.tournament_id = p_tournament_id
  order by pg.sort_order nulls last,
    coalesce(s.rank, tp.initial_ranking, case when t.pre_start then prev.rn end) asc nulls last,
    coalesce(s.points, 0) desc,
    tp.created_at, tp.id;
$$;

create or replace function public.get_player_tournament_history(p_tournament_id uuid, p_tp_id uuid)
returns table(
  round_number smallint, round_status round_status, board_number smallint, color text,
  opponent_name text, opponent_rating smallint, opponent_rank smallint, opponent_points numeric,
  result game_result, points_earned numeric, is_bye boolean, cumulative_pts numeric,
  opponent_title text, opponent_tp_id uuid, opponent_fide_name text, opponent_federation text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    r.round_number, r.status, p.board_number,
    case when p.white_tp_id = p_tp_id then 'white' else 'black' end,
    coalesce(opp_pl.full_name, 'BYE'),
    case when t.mode = 'native' then
      case t.rating_kind when 'rpd' then opp_pl.rating_rpd when 'blz' then opp_pl.rating_blz else opp_pl.rating_std end
    else opp_pl.rating_std end,
    opp_tp.current_rank, opp_s.points,
    p.result,
    case when p.white_tp_id = p_tp_id then p.white_points else p.black_points end,
    p.is_bye,
    sum(
      case when p2.white_tp_id = p_tp_id then p2.white_points else p2.black_points end
    ) over (order by r.round_number rows between unbounded preceding and current row),
    opp_pl.title,
    opp_tp.id,
    opp_pl.fide_name,
    opp_pl.federation
  from pairings p
  join rounds r on r.id = p.round_id
  join tournaments t on t.id = p_tournament_id
  left join tournament_players opp_tp
    on opp_tp.id = case when p.white_tp_id = p_tp_id then p.black_tp_id else p.white_tp_id end
  left join players opp_pl on opp_pl.id = opp_tp.player_id
  left join standings opp_s on opp_s.tournament_player_id = opp_tp.id
  join pairings p2 on p2.round_id = p.round_id
    and (p2.white_tp_id = p_tp_id or p2.black_tp_id = p_tp_id)
  where p.tournament_id = p_tournament_id
    and (p.white_tp_id = p_tp_id or p.black_tp_id = p_tp_id)
  order by r.round_number;
$$;
