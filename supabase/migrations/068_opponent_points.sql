-- get_player_tournament_history ganha opponent_points: a pontuação ATUAL do
-- adversário (standings.points), pra o organizador conferir Buchholz/
-- Sonneborn-Berger na mão sem precisar abrir a classificação em outra aba e
-- cruzar nome por nome. drop antes do create or replace porque muda o
-- shape da tabela de retorno (Postgres não deixa alterar colunas de uma
-- function existente com CREATE OR REPLACE).

drop function if exists get_player_tournament_history(uuid, uuid);

create or replace function get_player_tournament_history(
  p_tournament_id uuid,
  p_tp_id         uuid
)
returns table (
  round_number    smallint,
  round_status    round_status,
  board_number    smallint,
  color           text,
  opponent_name   text,
  opponent_rating smallint,
  opponent_rank   smallint,
  opponent_points numeric(5,1),
  result          game_result,
  points_earned   numeric(3,1),
  is_bye          boolean,
  cumulative_pts  numeric(5,1)
) language sql stable security definer as $$
  select
    r.round_number,
    r.status,
    p.board_number,
    case when p.white_tp_id = p_tp_id then 'white' else 'black' end,
    coalesce(opp_pl.full_name, 'BYE'),
    opp_pl.rating_std,
    opp_tp.current_rank,
    opp_s.points,
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
  left join standings opp_s on opp_s.tournament_player_id = opp_tp.id
  -- for cumulative points
  join pairings p2 on p2.round_id = p.round_id
    and (p2.white_tp_id = p_tp_id or p2.black_tp_id = p_tp_id)
  where p.tournament_id = p_tournament_id
    and (p.white_tp_id = p_tp_id or p.black_tp_id = p_tp_id)
  order by r.round_number;
$$;
