-- Rodadas mostram a bandeira/federação de cada jogador no torneio internacional (Mundial
-- FIDE). get_round_pairings passa a devolver players.federation de cada lado. Colunas novas
-- no FIM do RETURNS TABLE: quem já lê a função não é afetado, então esta migration pode (e
-- deve) ser aplicada antes do código que usa os campos. Definição vigente: 20261016120000.

drop function if exists get_round_pairings(uuid);
create function get_round_pairings(p_round_id uuid)
returns table(
  pairing_id uuid, board_number smallint, white_tp_id uuid, white_name text, white_rating smallint,
  white_rank smallint, white_score numeric, black_tp_id uuid, black_name text, black_rating smallint,
  black_rank smallint, black_score numeric, result game_result, white_points numeric,
  black_points numeric, is_bye boolean, manual_override boolean, white_title text, black_title text,
  white_fide_name text, black_fide_name text, white_federation text, black_federation text
)
language sql stable security definer as $$
  select
    p.id, p.board_number,
    wtp.id, wpl.full_name, wpl.rating_std, wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'), bpl.rating_std, btp.current_rank, btp.current_score,
    p.result, p.white_points, p.black_points, p.is_bye, p.manual_override,
    wpl.title, bpl.title, wpl.fide_name, bpl.fide_name, wpl.federation, bpl.federation
  from pairings p
  join tournament_players wtp on wtp.id = p.white_tp_id
  join players wpl on wpl.id = wtp.player_id
  left join tournament_players btp on btp.id = p.black_tp_id
  left join players bpl on bpl.id = btp.player_id
  where p.round_id = p_round_id
  order by p.board_number asc nulls last;
$$;
grant execute on function get_round_pairings(uuid) to public;
