-- ============================================================
-- Classificação ANTES da 1ª rodada: números pelo rating, depois pela ordem de inscrição
-- ============================================================
-- Pedido do dono (2026-10-28): enquanto não houve rodada, a classificação deve mostrar a
-- posição de cada jogador — primeiro por rating (o do ritmo do torneio, tournaments.rating_kind),
-- e quem não tem rating por ordem de inscrição.
--
-- Hoje o ranking inicial (tournament_players.initial_ranking) só nasce quando o grupo é
-- "semeado" (_generate_initial_ranking), então num torneio recém-criado a coluna "#" vinha
-- vazia ("–") e a ordem era arbitrária. Esta migration:
--   1. get_tournament_standings passa a calcular uma posição provisória (partição por grupo de
--      emparceiramento) para quem ainda não tem rank nem initial_ranking, MAS só enquanto
--      nenhuma rodada foi publicada. Com rodada publicada, volta ao comportamento de antes
--      (rank da `standings`, ou initial_ranking já congelado).
--   2. Nova coluna `rating_tempo`: o rating do ritmo do torneio (std/rpd/blz conforme
--      tournaments.rating_kind), que é o que ordena a prévia. A tabela da classificação
--      mostrava sempre `rating_std`, o que parecia desordenado num torneio rápido.
--   3. _generate_initial_ranking (a semeadura de verdade, usada no pareamento) usa o MESMO
--      critério, senão o número mostrado antes da rodada 1 mudaria quando o torneio começa:
--      rating desc; sem rating, ordem de inscrição (tournament_players.created_at); empate de
--      rating segue por nome, como antes.
--
-- Definições de partida: as VIGENTES no banco (get_tournament_standings veio da 20261016120000;
-- _generate_initial_ranking da 058/depois). Mudar as colunas de retorno exige drop + create
-- (os grants são refeitos abaixo, iguais aos de antes). Idempotente.

drop function if exists public.get_tournament_standings(uuid);
create function public.get_tournament_standings(p_tournament_id uuid)
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
    select rating_kind,
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
grant execute on function public.get_tournament_standings(uuid) to anon, authenticated, service_role;

create or replace function public._generate_initial_ranking(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_group pairing_groups%rowtype;
  v_t     tournaments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 42));

  select * into v_group from pairing_groups where id = p_group_id;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  select * into v_t from tournaments where id = v_group.tournament_id;
  if exists (
    select 1 from rounds r
    where r.pairing_group_id = p_group_id and r.status <> 'draft'
  ) then
    raise exception 'INVALID_STATE: ranking inicial congelado (rodada já publicada)';
  end if;

  update tournament_players set initial_ranking = null
  where pairing_group_id = p_group_id;

  with seeded as (
    select tp.id,
      row_number() over (
        order by
          rk desc nulls last,
          case when rk is null then tp.created_at end asc,
          pl.full_name asc,
          tp.id
      ) as rn
    from tournament_players tp
    join players pl on pl.id = tp.player_id
    cross join lateral (select case v_t.rating_kind
      when 'std' then pl.rating_std
      when 'rpd' then pl.rating_rpd
      when 'blz' then pl.rating_blz
    end as rk) r
    where tp.pairing_group_id = p_group_id and tp.status = 'active'
  )
  update tournament_players tp set initial_ranking = s.rn
  from seeded s where s.id = tp.id;

  perform _audit(v_t.id, 'generate_initial_ranking', 'pairing_group', p_group_id, null);
end $$;
revoke all on function public._generate_initial_ranking(uuid) from public, anon, authenticated;
