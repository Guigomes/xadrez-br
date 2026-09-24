-- ============================================================
-- Migration 081: classificação mostra o ranking inicial antes da 1ª rodada
-- ============================================================
-- get_tournament_standings (077) partia de `standings` (inner join) — sem
-- nenhuma linha lá (torneio ainda não começou: nem native antes do primeiro
-- resultado, nem importado antes do chess-results publicar rodada 1), a
-- classificação pública vinha vazia mesmo com os inscritos e o ranking
-- inicial já prontos em `tournament_players.initial_ranking`. Pedido do
-- usuário: mostrar esse ranking inicial como ponto de partida.
--
-- Agora parte de `tournament_players` (left join com `standings`): quem
-- ainda não tem linha em `standings` aparece com rank = initial_ranking e
-- estatísticas zeradas/nulas (pontos 0, desempates nulos — não há o que
-- calcular ainda). Assim que a primeira linha de `standings` for gravada
-- (import-standings do worker, ou o fluxo nativo depois do 1º resultado),
-- ela passa a mandar no rank/pontos daquele jogador, igual antes.
--
-- Idempotente.

drop function if exists get_tournament_standings(uuid);
create function get_tournament_standings(p_tournament_id uuid)
returns table(
  rank smallint, player_id uuid, full_name text, federation text, state text,
  rating_std smallint, initial_ranking smallint, points numeric, games_played smallint,
  wins smallint, draws smallint, losses smallint, buchholz numeric, buchholz_cut1 numeric,
  sonneborn_berger numeric, progressive numeric, performance_rating smallint,
  category_name text, category_id uuid, pairing_group_id uuid, pairing_group_name text,
  tp_id uuid, player_status player_tournament_status, title text
)
language sql stable security definer as $$
  select
    coalesce(s.rank, tp.initial_ranking), pl.id, pl.full_name, pl.federation, pl.state, pl.rating_std,
    tp.initial_ranking, coalesce(s.points, 0), coalesce(s.games_played, 0),
    coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0),
    s.buchholz, s.buchholz_cut1, s.sonneborn_berger, s.progressive, s.performance_rating,
    cat.name, cat.id, pg.id, pg.name, tp.id, tp.status, pl.title
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
grant execute on function get_tournament_standings(uuid) to public;
