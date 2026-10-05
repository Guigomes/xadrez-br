-- Histórico de rodadas do jogador passa a devolver o id do adversário no
-- torneio (opponent_tp_id), pra tela poder levar da linha do adversário pro
-- histórico dele. Só acrescenta uma coluna no fim — o resto é idêntico à
-- definição anterior (077: opponent_title). Muda o tipo de retorno, então
-- precisa de drop + create.

drop function if exists public.get_player_tournament_history(uuid, uuid);

create function public.get_player_tournament_history(p_tournament_id uuid, p_tp_id uuid)
returns table(
  round_number smallint, round_status round_status, board_number smallint, color text,
  opponent_name text, opponent_rating smallint, opponent_rank smallint, opponent_points numeric,
  result game_result, points_earned numeric, is_bye boolean, cumulative_pts numeric,
  opponent_title text, opponent_tp_id uuid
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
    opp_tp.id
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
