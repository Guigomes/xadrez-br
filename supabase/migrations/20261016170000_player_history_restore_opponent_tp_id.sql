-- Corrige a 20261016120000: ela recriou get_player_tournament_history a partir da 077 e
-- PERDEU a coluna opponent_tp_id (acrescentada em 20261005190000) — na página do jogador o
-- adversário deixou de ser link. Esta é a definição de 20261005190000 com as colunas de
-- 20261016120000 (opponent_fide_name) e a federação do adversário (opponent_federation,
-- usada pela aba "Por país" para mostrar a bandeira), sempre no FIM do retorno.

drop function if exists public.get_player_tournament_history(uuid, uuid);

create function public.get_player_tournament_history(p_tournament_id uuid, p_tp_id uuid)
returns table(
  round_number smallint, round_status round_status, board_number smallint, color text,
  opponent_name text, opponent_rating smallint, opponent_rank smallint, opponent_points numeric,
  result game_result, points_earned numeric, is_bye boolean, cumulative_pts numeric,
  opponent_title text, opponent_tp_id uuid, opponent_fide_name text, opponent_federation text
)
language sql stable security definer as $$
  select
    r.round_number, r.status, p.board_number,
    case when p.white_tp_id = p_tp_id then 'white' else 'black' end,
    coalesce(opp_pl.full_name, 'BYE'), opp_pl.rating_std, opp_tp.current_rank, opp_s.points,
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

grant execute on function public.get_player_tournament_history(uuid, uuid) to anon, authenticated;
