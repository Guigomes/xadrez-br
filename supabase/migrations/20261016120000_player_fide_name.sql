-- Nome no formato FIDE ("Sobrenome, Nome") ao lado do nome de exibição brasileiro.
--
-- Fontes como o info64.org (Mundial FIDE, torneios da Federação Espanhola) publicam o nome
-- no padrão de cadastro da FIDE: "Teodosio, Pedro Joaquim Maurer". Antes o importador só
-- tirava a vírgula e o site mostrava "Teodosio Pedro Joaquim Maurer" — ilegível para quem
-- é do Brasil. Agora players.full_name guarda a ordem brasileira ("Pedro Joaquim Maurer
-- Teodosio") e players.fide_name o formato original, usado para visitantes de outros
-- idiomas. NULL quando a fonte não traz o nome nesse formato (chess-results dos torneios
-- brasileiros, onde a vírgula não é confiável): a tela usa full_name.
alter table players add column if not exists fide_name text;

comment on column players.fide_name is
  'Nome no formato FIDE "Sobrenome, Nome", quando a fonte traz. Exibido para visitantes fora do pt-BR; NULL = usar full_name.';

-- As três funções que entregam nome de jogador às telas passam a devolver também o
-- fide_name. Mudar o RETURNS TABLE exige drop + create; as definições abaixo são as
-- vigentes (20261011140000 e 077) com a coluna nova no fim.

drop function if exists get_tournament_standings(uuid);
create function get_tournament_standings(p_tournament_id uuid)
returns table (
  rank smallint, player_id uuid, full_name text, federation text, state text, rating_std smallint,
  initial_ranking smallint, points numeric, games_played smallint, wins smallint, draws smallint,
  losses smallint, buchholz numeric, buchholz_cut1 numeric, sonneborn_berger numeric,
  progressive numeric, performance_rating smallint, category_name text, category_id uuid,
  pairing_group_id uuid, pairing_group_name text, tp_id uuid, player_status player_tournament_status,
  title text, sex text, fide_name text
)
language sql stable security definer
as $$
  select
    coalesce(s.rank, tp.initial_ranking), pl.id, pl.full_name, pl.federation, pl.state, pl.rating_std,
    tp.initial_ranking, coalesce(s.points, 0), coalesce(s.games_played, 0),
    coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0),
    s.buchholz, s.buchholz_cut1, s.sonneborn_berger, s.progressive, s.performance_rating,
    cat.name, cat.id, pg.id, pg.name, tp.id, tp.status, pl.title, pl.sex::text, pl.fide_name
  from tournament_players tp
  join players pl on pl.id = tp.player_id
  left join standings s on s.tournament_player_id = tp.id and s.tournament_id = p_tournament_id
  left join tournament_categories cat on cat.id = tp.category_id
  left join pairing_groups pg on pg.id = tp.pairing_group_id
  where tp.tournament_id = p_tournament_id
  order by pg.sort_order nulls last,
    coalesce(s.rank, tp.initial_ranking) asc nulls last,
    coalesce(s.points, 0) desc;
$$;
grant execute on function get_tournament_standings(uuid) to anon, authenticated, service_role;

drop function if exists get_round_pairings(uuid);
create function get_round_pairings(p_round_id uuid)
returns table(
  pairing_id uuid, board_number smallint, white_tp_id uuid, white_name text, white_rating smallint,
  white_rank smallint, white_score numeric, black_tp_id uuid, black_name text, black_rating smallint,
  black_rank smallint, black_score numeric, result game_result, white_points numeric,
  black_points numeric, is_bye boolean, manual_override boolean, white_title text, black_title text,
  white_fide_name text, black_fide_name text
)
language sql stable security definer as $$
  select
    p.id, p.board_number,
    wtp.id, wpl.full_name, wpl.rating_std, wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'), bpl.rating_std, btp.current_rank, btp.current_score,
    p.result, p.white_points, p.black_points, p.is_bye, p.manual_override,
    wpl.title, bpl.title, wpl.fide_name, bpl.fide_name
  from pairings p
  join tournament_players wtp on wtp.id = p.white_tp_id
  join players wpl on wpl.id = wtp.player_id
  left join tournament_players btp on btp.id = p.black_tp_id
  left join players bpl on bpl.id = btp.player_id
  where p.round_id = p_round_id
  order by p.board_number asc nulls last;
$$;
grant execute on function get_round_pairings(uuid) to public;

drop function if exists get_player_tournament_history(uuid, uuid);
create function get_player_tournament_history(p_tournament_id uuid, p_tp_id uuid)
returns table(
  round_number smallint, round_status round_status, board_number smallint, color text,
  opponent_name text, opponent_rating smallint, opponent_rank smallint, opponent_points numeric,
  result game_result, points_earned numeric, is_bye boolean, cumulative_pts numeric,
  opponent_title text, opponent_fide_name text
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
    opp_pl.title, opp_pl.fide_name
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
grant execute on function get_player_tournament_history(uuid, uuid) to public;
