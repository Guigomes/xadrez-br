-- Classificação feminina transversal (como o Absoluto): todas as jogadoras do torneio,
-- de qualquer categoria, reordenadas só entre elas. Não é uma tournament_categories: a
-- categoria é uma partição (cada jogador numa só — U14, S50…), e uma jogadora U14 precisa
-- aparecer na U14 E na Feminina. Mesmo raciocínio do has_absolute_classification (065).
alter table tournaments
  add column if not exists has_female_classification boolean not null default false;

-- A classificação passa a devolver o sexo do jogador (players.sex: 'm' | 'w' | null), que a
-- tela usa para o recorte feminino. Mudar o RETURNS TABLE exige drop + create.
drop function if exists get_tournament_standings(uuid);

create function get_tournament_standings(p_tournament_id uuid)
returns table (
  rank smallint, player_id uuid, full_name text, federation text, state text, rating_std smallint,
  initial_ranking smallint, points numeric, games_played smallint, wins smallint, draws smallint,
  losses smallint, buchholz numeric, buchholz_cut1 numeric, sonneborn_berger numeric,
  progressive numeric, performance_rating smallint, category_name text, category_id uuid,
  pairing_group_id uuid, pairing_group_name text, tp_id uuid, player_status player_tournament_status,
  title text, sex text
)
language sql stable security definer
as $$
  select
    coalesce(s.rank, tp.initial_ranking), pl.id, pl.full_name, pl.federation, pl.state, pl.rating_std,
    tp.initial_ranking, coalesce(s.points, 0), coalesce(s.games_played, 0),
    coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0),
    s.buchholz, s.buchholz_cut1, s.sonneborn_berger, s.progressive, s.performance_rating,
    cat.name, cat.id, pg.id, pg.name, tp.id, tp.status, pl.title, pl.sex::text
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
