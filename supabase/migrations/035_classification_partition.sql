-- ============================================================
-- Migration 035: classificações como partição derivada
-- ============================================================
-- Corrige o modelo introduzido na 034. Lá a classificação era escolhida
-- pelo inscrito num dropdown e essa escolha também definia o grupo de
-- emparceiramento. O modelo correto (retomando o que a 015 já documentava
-- em `comment on column tournament_categories.pairing_group_id`):
--
--  * Grupo de emparceiramento (pairing_groups) = quem joga contra quem.
--    Jogador pertence a exatamente um. Não muda nesta migration.
--  * Classificação (tournament_categories) = célula de uma PARTIÇÃO,
--    para ranking/premiação. Jogador pertence a NO MÁXIMO uma, DERIVADA
--    dos dados dele (birth_year/rating_std/sex), nunca escolhida. O Geral
--    de cada grupo é implícito — não existe linha própria pra ele.
--  * Entre as classificações que um jogador satisfaz, vence a mais
--    específica (mais critérios não-nulos) — é isso que garante que uma
--    mulher Sub-17 caia em "Sub-17 Feminino" e não em "Sub-17".
--  * Quem não bate com nenhuma classificação (falta birth_year/rating_std)
--    fica só no Geral — não inventamos dado.
--
-- tournament_registrations.category_id (034) continua existindo, mas passa
-- a significar só "o que o inscrito declarou no formulário" — usado para
-- comparação/alerta de divergência no admin, não mais pra derivar o grupo.

-- ------------------------------------------------------------
-- 1. tournament_categories: ordem estável + unicidade por nome + FK corrigida
-- ------------------------------------------------------------
alter table tournament_categories
  add column if not exists sort_order smallint not null default 0;

create unique index if not exists idx_tournament_categories_unique_name
  on tournament_categories (tournament_id, lower(name));

-- A FK original (001_initial_schema.sql) não tinha ON DELETE — apagar uma
-- classificação com jogadores derivados nela quebrava com violação de FK.
alter table tournament_players
  drop constraint if exists tournament_players_category_id_fkey;
alter table tournament_players
  add constraint tournament_players_category_id_fkey
  foreign key (category_id) references tournament_categories(id) on delete set null;

-- ------------------------------------------------------------
-- 2. tournaments: respostas das 3 perguntas + dimensão de emparceiramento
-- ------------------------------------------------------------
alter table tournaments
  add column if not exists classification_dimensions text[] not null default '{}';
do $$ begin
  alter table tournaments
    add constraint tournaments_classification_dimensions_check
    check (classification_dimensions <@ array['age', 'rating', 'sex']);
exception when duplicate_object then null; end $$;

alter table tournaments
  add column if not exists pairing_split text;
do $$ begin
  alter table tournaments
    add constraint tournaments_pairing_split_check
    check (pairing_split in ('age', 'rating', 'sex'));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 3. derive_player_category: qual classificação (se alguma) um tp casa.
-- ------------------------------------------------------------
create or replace function derive_player_category(p_tournament_id uuid, p_tp_id uuid)
returns uuid language plpgsql stable security definer as $$
declare
  v_sex        char(1);
  v_birth_year smallint;
  v_rating     smallint;
  v_group_id   uuid;
  v_start_year int;
  v_age        int;
  v_best_id    uuid;
begin
  select pl.sex, pl.birth_year, pl.rating_std, tp.pairing_group_id
    into v_sex, v_birth_year, v_rating, v_group_id
  from tournament_players tp
  join players pl on pl.id = tp.player_id
  where tp.id = p_tp_id and tp.tournament_id = p_tournament_id;

  if not found then return null; end if;

  select extract(year from start_date)::int into v_start_year
  from tournaments where id = p_tournament_id;

  if v_birth_year is not null and v_start_year is not null then
    v_age := v_start_year - v_birth_year;
  end if;

  -- Entre as classificações que o jogador satisfaz, a mais específica
  -- (mais critérios não-nulos) vence — é isso que garante que uma mulher
  -- Sub-17 caia em "Sub-17 Feminino" e não em "Sub-17". Empate: sort_order.
  select c.id into v_best_id
  from tournament_categories c
  where c.tournament_id = p_tournament_id
    and (c.pairing_group_id is null or c.pairing_group_id = v_group_id)
    -- sexo: se a categoria exige, jogador precisa ter o mesmo sexo declarado
    -- (sexo nulo no jogador não casa com categoria que exige sexo).
    and (c.sex is null or (v_sex is not null and v_sex = c.sex))
    -- idade: exige birth_year conhecido.
    and (
      (c.min_age is null and c.max_age is null)
      or (v_age is not null
          and (c.min_age is null or v_age >= c.min_age)
          and (c.max_age is null or v_age <= c.max_age))
    )
    -- rating: exige rating_std conhecido.
    and (
      (c.min_rating is null and c.max_rating is null)
      or (v_rating is not null
          and (c.min_rating is null or v_rating >= c.min_rating)
          and (c.max_rating is null or v_rating <= c.max_rating))
    )
  order by
    (case when c.sex is not null then 1 else 0 end
     + case when c.min_age is not null or c.max_age is not null then 1 else 0 end
     + case when c.min_rating is not null or c.max_rating is not null then 1 else 0 end) desc,
    c.sort_order asc
  limit 1;

  return v_best_id;
end $$;

-- ------------------------------------------------------------
-- 4. refresh_tournament_categories: reatribui category_id de todo mundo.
-- ------------------------------------------------------------
create or replace function refresh_tournament_categories(p_tournament_id uuid)
returns int language plpgsql security definer as $$
declare
  v_tp        record;
  v_unmatched int := 0;
  v_has_cats  boolean;
begin
  if not is_tournament_organizer(p_tournament_id) then raise exception 'FORBIDDEN'; end if;

  select exists(select 1 from tournament_categories where tournament_id = p_tournament_id)
    into v_has_cats;

  for v_tp in
    select id from tournament_players where tournament_id = p_tournament_id
  loop
    update tournament_players
    set category_id = derive_player_category(p_tournament_id, v_tp.id)
    where id = v_tp.id;

    if v_has_cats and not exists (
      select 1 from tournament_players where id = v_tp.id and category_id is not null
    ) then
      v_unmatched := v_unmatched + 1;
    end if;
  end loop;

  perform _audit(p_tournament_id, 'refresh_tournament_categories', 'tournament', p_tournament_id,
    jsonb_build_object('unmatched', v_unmatched));

  return v_unmatched;
end $$;

-- ------------------------------------------------------------
-- 5. get_tournament_standings: acrescenta category_id (category_name já
--    existia — agora significa "classificação derivada", não mais
--    "declarada na inscrição"). returns table muda -> precisa DROP antes.
-- ------------------------------------------------------------
drop function if exists get_tournament_standings(uuid);

create or replace function get_tournament_standings(p_tournament_id uuid)
returns table (
  rank                  smallint,
  player_id             uuid,
  full_name             text,
  federation            text,
  state                 text,
  rating_std            smallint,
  initial_ranking       smallint,
  points                numeric(5,1),
  games_played          smallint,
  wins                  smallint,
  draws                 smallint,
  losses                smallint,
  buchholz              numeric(6,1),
  buchholz_cut1         numeric(6,1),
  sonneborn_berger      numeric(8,2),
  progressive           numeric(7,1),
  performance_rating    smallint,
  category_name         text,
  category_id           uuid,
  pairing_group_id      uuid,
  pairing_group_name    text,
  tp_id                 uuid,
  player_status         player_tournament_status
) language sql stable security definer as $$
  select
    s.rank,
    pl.id,
    pl.full_name,
    pl.federation,
    pl.state,
    pl.rating_std,
    tp.initial_ranking,
    s.points,
    s.games_played,
    s.wins,
    s.draws,
    s.losses,
    s.buchholz,
    s.buchholz_cut1,
    s.sonneborn_berger,
    s.progressive,
    s.performance_rating,
    cat.name,
    cat.id,
    pg.id,
    pg.name,
    tp.id,
    tp.status
  from standings s
  join tournament_players tp on tp.id = s.tournament_player_id
  join players pl on pl.id = tp.player_id
  left join tournament_categories cat on cat.id = tp.category_id
  left join pairing_groups pg on pg.id = tp.pairing_group_id
  where s.tournament_id = p_tournament_id
  order by pg.sort_order nulls last, s.rank asc nulls last, s.points desc;
$$;

-- ------------------------------------------------------------
-- 6. approve_registration: category_id passa a vir da derivação; o grupo
--    de pareamento pode vir de pairing_split quando pairing_mode='per_category'.
-- ------------------------------------------------------------
create or replace function approve_registration(p_registration_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_reg tournament_registrations%rowtype;
  v_t   tournaments%rowtype;
  v_player_id uuid;
  v_tp_id     uuid;
  v_group_id  uuid;
  v_cat_id    uuid;
  v_start_year int;
  v_age        int;
  v_join_round smallint := 1;
  v_round record;
begin
  select * into v_reg from tournament_registrations where id = p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  select * into v_t from tournaments where id = v_reg.tournament_id;
  if not is_tournament_organizer(v_t.id) then raise exception 'FORBIDDEN'; end if;
  if v_reg.status <> 'pending' then raise exception 'INVALID_STATE: inscrição não está pendente'; end if;

  -- find-or-create player: CBX → FIDE → nome exato
  if v_reg.cbx_id is not null then
    select id into v_player_id from players where cbx_id = v_reg.cbx_id limit 1;
  end if;
  if v_player_id is null and v_reg.fide_id is not null then
    select id into v_player_id from players where fide_id = v_reg.fide_id limit 1;
  end if;
  if v_player_id is null then
    select id into v_player_id from players
    where lower(full_name) = lower(trim(v_reg.full_name)) limit 1;
  end if;
  if v_player_id is null then
    insert into players (full_name, birth_year, city, federation, fide_id, cbx_id, rating_std, sex)
    values (trim(v_reg.full_name), v_reg.birth_year, v_reg.city, v_reg.federation,
            v_reg.fide_id, v_reg.cbx_id, v_reg.rating_std, v_reg.sex)
    returning id into v_player_id;
  else
    update players set sex = v_reg.sex
    where id = v_player_id and sex is null and v_reg.sex is not null;
  end if;

  -- grupo de pareamento: se o emparceiramento é dividido por uma dimensão
  -- (pairing_split), acha o grupo da faixa daquela dimensão que bate com o
  -- jogador; senão cai no fallback legado (grupo único / grupo informado).
  if v_t.pairing_mode = 'per_category' and v_t.pairing_split is not null then
    if v_t.pairing_split = 'age' then
      select extract(year from v_t.start_date)::int into v_start_year;
      if v_reg.birth_year is not null and v_start_year is not null then
        v_age := v_start_year - v_reg.birth_year;
        select c.pairing_group_id into v_group_id
        from tournament_categories c
        where c.tournament_id = v_t.id and c.pairing_group_id is not null
          and c.min_age is not null and c.max_age is not null
          and v_age between c.min_age and c.max_age
        order by c.sort_order limit 1;
      end if;
    elsif v_t.pairing_split = 'rating' then
      if v_reg.rating_std is not null then
        select c.pairing_group_id into v_group_id
        from tournament_categories c
        where c.tournament_id = v_t.id and c.pairing_group_id is not null
          and (c.min_rating is not null or c.max_rating is not null)
          and v_reg.rating_std between coalesce(c.min_rating, 0) and coalesce(c.max_rating, 32767)
        order by c.sort_order limit 1;
      end if;
    elsif v_t.pairing_split = 'sex' then
      if v_reg.sex is not null then
        select c.pairing_group_id into v_group_id
        from tournament_categories c
        where c.tournament_id = v_t.id and c.pairing_group_id is not null and c.sex = v_reg.sex
        order by c.sort_order limit 1;
      end if;
    end if;
  end if;

  if v_group_id is null and v_reg.category_id is not null then
    select pairing_group_id into v_group_id from tournament_categories
    where id = v_reg.category_id and tournament_id = v_t.id;
  end if;
  if v_group_id is null then v_group_id := v_reg.pairing_group_id; end if;
  if v_group_id is null then
    select id into v_group_id from pairing_groups
    where tournament_id = v_t.id order by sort_order limit 1;
  end if;

  -- entrada tardia: entra na próxima rodada do grupo
  if v_t.status = 'ongoing' then
    select coalesce(max(r.round_number), 0) + 1 into v_join_round
    from rounds r
    where r.tournament_id = v_t.id
      and (v_group_id is null or r.pairing_group_id = v_group_id)
      and r.status <> 'draft';
  end if;

  select id into v_tp_id from tournament_players
  where tournament_id = v_t.id and player_id = v_player_id;
  if v_tp_id is null then
    insert into tournament_players (tournament_id, player_id, pairing_group_id, status, joined_at_round)
    values (v_t.id, v_player_id, v_group_id, 'active', v_join_round)
    returning id into v_tp_id;

    v_cat_id := derive_player_category(v_t.id, v_tp_id);
    update tournament_players set category_id = v_cat_id where id = v_tp_id;

    for v_round in
      select r.id from rounds r
      where r.tournament_id = v_t.id
        and (v_group_id is null or r.pairing_group_id = v_group_id)
        and r.status in ('ongoing', 'finished')
    loop
      insert into pairings (tournament_id, round_id, white_tp_id, result,
                            white_points, is_bye, bye_kind)
      values (v_t.id, v_round.id, v_tp_id, 'bye', 0, true, 'late_entry');
    end loop;
  else
    v_cat_id := derive_player_category(v_t.id, v_tp_id);
    update tournament_players set category_id = v_cat_id where id = v_tp_id;
  end if;

  update tournament_registrations set
    status = 'approved', player_id = v_player_id, tournament_player_id = v_tp_id,
    approved_by = auth.uid(), approved_at = now()
  where id = p_registration_id;

  perform _audit(v_t.id, 'approve_registration', 'registration', p_registration_id,
    jsonb_build_object('tp_id', v_tp_id, 'player_id', v_player_id, 'joined_at_round', v_join_round,
                        'category_id', v_cat_id));
  return v_tp_id;
end $$;
