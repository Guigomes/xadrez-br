-- Classificação mostra também o rating FIDE do participante (tournament_players.fide_rating,
-- migration 20261125120000), gravado pelo robô quando o chess-results publica "EloI".
-- Corpo idêntico à definição vigente (20261028200000) + uma coluna no fim.
-- Mudar o retorno exige drop + create; permissões refeitas iguais às de antes (público).
-- Rollback: dropar e rodar de novo a 20261028200000.
drop function if exists public.get_tournament_standings(uuid);

create function public.get_tournament_standings(p_tournament_id uuid)
returns table(
  rank smallint, player_id uuid, full_name text, federation text, state text,
  rating_std smallint, initial_ranking smallint, points numeric, games_played smallint,
  wins smallint, draws smallint, losses smallint, buchholz numeric, buchholz_cut1 numeric,
  sonneborn_berger numeric, progressive numeric, performance_rating smallint,
  category_name text, category_id uuid, pairing_group_id uuid, pairing_group_name text,
  tp_id uuid, player_status player_tournament_status, title text, sex text, fide_name text,
  rating_tempo smallint, fide_rating integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (
    select case when mode = 'native' then rating_kind::text else 'std' end as rating_kind,
      mode = 'native'
        and not exists (select 1 from rounds r where r.tournament_id = p_tournament_id and r.status <> 'draft') as pre_start
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
    case t.rating_kind when 'std' then pl.rating_std when 'rpd' then pl.rating_rpd when 'blz' then pl.rating_blz end,
    tp.fide_rating
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

grant execute on function public.get_tournament_standings(uuid) to anon, authenticated, service_role;
