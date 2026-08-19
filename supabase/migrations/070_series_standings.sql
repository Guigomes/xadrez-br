-- ============================================================
-- Migration 070: cálculo da classificação de série
-- ============================================================
-- Depende das tabelas da 069. Aqui mora a conversão "colocação numa etapa →
-- pontos de série" e a leitura agregada.
--
-- Duas coisas que este arquivo resolve de propósito SEM mexer no que já roda:
--
-- 1. Colocação por categoria não existe no banco. `recalculate_standings`
--    (023) só grava `standings.rank` particionado por pairing_group_id; o
--    ranking por classificação é reindexado no navegador
--    (components/tournament/standings-view.tsx). Aqui a colocação por
--    categoria é derivada no SQL, na hora. Alterar recalculate_standings pra
--    persistir isso seria mexer numa função chamada por 5 RPCs de ciclo de
--    vida que já estão em produção — risco desproporcional pra uma feature
--    nova que consegue derivar o mesmo número.
--
-- 2. A ordenação usa os desempates DO TORNEIO (tournaments.tiebreak_order),
--    porque é a colocação daquela etapa que está sendo apurada — o mesmo
--    número que a tabela de classificação do torneio mostra. Os desempates da
--    SÉRIE (tournament_series.tiebreak_order) só entram na agregação final,
--    em get_series_standings, e são de outro domínio (etapas disputadas,
--    melhor colocação, soma de pontos de xadrez).

-- ------------------------------------------------------------
-- 1. Identidade do jogador entre etapas
-- ------------------------------------------------------------
-- CBX → FIDE → id da linha. O find-or-create de approve_registration (035)
-- casa por CBX, FIDE e nome exato — quando nenhum casa, nasce uma linha nova
-- em `players` pra alguém que já estava lá com o nome escrito diferente.
-- Agregar por CBX/FIDE junta essas duas linhas sem precisar deduplicar o
-- cadastro. Sem federação declarada não há chave estável: cai no uuid, e o
-- jogador aparece separado — comportamento honesto, a UI pode sinalizar.
create or replace function series_identity_key(p_player_id uuid)
returns text language sql stable as $$
  select case
    when nullif(btrim(pl.cbx_id), '') is not null  then 'cbx:'  || btrim(pl.cbx_id)
    when nullif(btrim(pl.fide_id), '') is not null then 'fide:' || btrim(pl.fide_id)
    else 'pid:' || pl.id::text
  end
  from players pl
  where pl.id = p_player_id;
$$;

-- ------------------------------------------------------------
-- 2. ORDER BY dos desempates do torneio (whitelist)
-- ------------------------------------------------------------
-- Mesma whitelist hard-coded de recalculate_standings (023:156) — nunca texto
-- livre do usuário chegando em `execute format`. Extraída pra função porque
-- agora dois lugares precisam dela.
create or replace function _tournament_tiebreak_sql(p_order text[])
returns text language sql immutable as $$
  select coalesce(
    nullif(string_agg(col, ', '), ''),
    's.buchholz desc nulls last, s.buchholz_cut1 desc nulls last, s.sonneborn_berger desc nulls last'
  )
  from (
    select case tb
      when 'buchholz'         then 's.buchholz desc nulls last'
      when 'buchholz_cut1'    then 's.buchholz_cut1 desc nulls last'
      when 'sonneborn_berger' then 's.sonneborn_berger desc nulls last'
      when 'wins'             then 's.wins desc nulls last'
      when 'progressive'      then 's.progressive desc nulls last'
    end as col
    from unnest(coalesce(p_order, '{}')) as tb
  ) x
  where col is not null;
$$;

-- ------------------------------------------------------------
-- 3. Recálculo (interno, sem checagem de permissão)
-- ------------------------------------------------------------
-- Separado do RPC público porque o trigger de "torneio encerrou" roda no
-- contexto do organizador DO TORNEIO, que não necessariamente gerencia a
-- série. A guarda de permissão fica no wrapper.
create or replace function _recalculate_series_standings(p_series_id uuid)
returns int language plpgsql security definer as $$
declare
  v_series    tournament_series%rowtype;
  v_t         record;
  v_order_sql text;
  v_count     int := 0;
begin
  select * into v_series from tournament_series where id = p_series_id;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;

  delete from series_points_awarded where series_id = p_series_id;

  -- Só etapa encerrada pontua: enquanto o torneio corre, a colocação muda a
  -- cada resultado e a classificação da série ficaria oscilando.
  for v_t in
    select t.id, t.tiebreak_order
    from series_tournaments st
    join tournaments t on t.id = st.tournament_id
    where st.series_id = p_series_id
      and t.status = 'finished'
    order by st.sort_order, t.start_date
  loop
    v_order_sql := _tournament_tiebreak_sql(v_t.tiebreak_order);

    -- 3a. Escopo absoluto: colocação geral DENTRO de cada grupo de
    -- emparceiramento (ver nota 4 no cabeçalho da 069).
    if v_series.has_absolute_classification then
      execute format($f$
        insert into series_points_awarded (
          series_id, tournament_id, pairing_group_id,
          scope_key, scope_name, identity_key, player_id, place, chess_points
        )
        select
          $1, $2, tp.pairing_group_id,
          '__absoluto__', 'Absoluto',
          series_identity_key(tp.player_id), tp.player_id,
          -- Parênteses ao redor do window function: sem eles o `::smallint`
          -- não tem um primary pra se aplicar e o parser reclama.
          (row_number() over (
            partition by tp.pairing_group_id
            order by s.points desc, %s
          ))::smallint,
          s.points
        from standings s
        join tournament_players tp on tp.id = s.tournament_player_id
        where s.tournament_id = $2
          and tp.status = 'active'
      $f$, v_order_sql) using p_series_id, v_t.id;
    end if;

    -- 3b. Escopo por classificação: mesma ordenação, particionada também pela
    -- categoria derivada. Jogador sem categoria (derive_player_category não
    -- casou — falta birth_year/rating) simplesmente não entra em nenhum
    -- ranking de faixa; não inventamos dado.
    execute format($f$
      insert into series_points_awarded (
        series_id, tournament_id, pairing_group_id,
        scope_key, scope_name, identity_key, player_id, place, chess_points
      )
      select
        $1, $2, tp.pairing_group_id,
        lower(btrim(cat.name)), btrim(cat.name),
        series_identity_key(tp.player_id), tp.player_id,
        (row_number() over (
          partition by tp.pairing_group_id, tp.category_id
          order by s.points desc, %s
        ))::smallint,
        s.points
      from standings s
      join tournament_players tp on tp.id = s.tournament_player_id
      join tournament_categories cat on cat.id = tp.category_id
      where s.tournament_id = $2
        and tp.status = 'active'
    $f$, v_order_sql) using p_series_id, v_t.id;

    v_count := v_count + 1;
  end loop;

  -- Conversão colocação → pontos, num passo só depois de tudo inserido.
  update series_points_awarded a
  set points = coalesce(
    (select r.points from series_points_rules r
      where r.series_id = a.series_id and r.place = a.place),
    v_series.points_outside_table
  )
  where a.series_id = p_series_id;

  return v_count;
end $$;

-- ------------------------------------------------------------
-- 4. Recálculo (RPC público)
-- ------------------------------------------------------------
create or replace function recalculate_series_standings(p_series_id uuid)
returns int language plpgsql security definer as $$
begin
  if not is_series_manager(p_series_id) then raise exception 'FORBIDDEN'; end if;
  return _recalculate_series_standings(p_series_id);
end $$;

-- ------------------------------------------------------------
-- 5. Recálculo automático quando uma etapa encerra
-- ------------------------------------------------------------
-- O gancho é a virada de status pra 'finished', que hoje acontece por
-- finish_round (036_auto_finish_tournament) ou pelo stepper do organizador.
-- Correção de resultado DEPOIS do encerramento não passa por aqui — para esse
-- caso existe o botão "Recalcular" no admin da série.
create or replace function trg_recalc_series_on_tournament_finish()
returns trigger language plpgsql security definer as $$
declare
  v_series_id uuid;
begin
  if new.status = 'finished' and old.status is distinct from 'finished' then
    for v_series_id in
      select series_id from series_tournaments where tournament_id = new.id
    loop
      perform _recalculate_series_standings(v_series_id);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_recalc_series_on_finish on tournaments;
create trigger trg_recalc_series_on_finish
  after update of status on tournaments
  for each row execute function trg_recalc_series_on_tournament_finish();

-- ------------------------------------------------------------
-- 6. Vincular / desvincular etapa
-- ------------------------------------------------------------
-- RPC em vez de insert direto porque são três validações, e a do contrato de
-- classificação precisa virar mensagem acionável na tela ("ajuste a
-- classificação desta etapa"), não violação de constraint.
create or replace function add_tournament_to_series(
  p_series_id uuid,
  p_tournament_id uuid,
  p_label text default null,
  p_sort_order smallint default null
) returns uuid language plpgsql security definer as $$
declare
  v_series tournament_series%rowtype;
  v_t      tournaments%rowtype;
  v_order  smallint;
  v_id     uuid;
begin
  select * into v_series from tournament_series where id = p_series_id;
  if not found then raise exception 'SERIES_NOT_FOUND'; end if;
  if not is_series_manager(p_series_id) then raise exception 'FORBIDDEN'; end if;

  select * into v_t from tournaments where id = p_tournament_id;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if not is_tournament_organizer(p_tournament_id) then
    raise exception 'FORBIDDEN_TOURNAMENT: você não organiza este torneio';
  end if;

  -- Igualdade de conjuntos (contenção nos dois sentidos) — a ordem do array
  -- não importa, o conteúdo sim.
  if not (
    coalesce(v_t.classification_dimensions, '{}') <@ coalesce(v_series.classification_dimensions, '{}')
    and coalesce(v_series.classification_dimensions, '{}') <@ coalesce(v_t.classification_dimensions, '{}')
  ) then
    raise exception 'CLASSIFICATION_MISMATCH: a etapa classifica por %, a série por %',
      coalesce(array_to_string(v_t.classification_dimensions, ', '), 'nada'),
      coalesce(array_to_string(v_series.classification_dimensions, ', '), 'nada');
  end if;

  v_order := coalesce(
    p_sort_order,
    (select coalesce(max(sort_order), 0) + 1 from series_tournaments where series_id = p_series_id)::smallint
  );

  insert into series_tournaments (series_id, tournament_id, label, sort_order)
  values (p_series_id, p_tournament_id, nullif(btrim(p_label), ''), v_order)
  on conflict (series_id, tournament_id) do update
    set label = excluded.label, sort_order = excluded.sort_order
  returning id into v_id;

  perform _audit(p_tournament_id, 'add_tournament_to_series', 'series', p_series_id,
    jsonb_build_object('series_id', p_series_id, 'sort_order', v_order));

  perform _recalculate_series_standings(p_series_id);
  return v_id;
end $$;

create or replace function remove_tournament_from_series(
  p_series_id uuid, p_tournament_id uuid
) returns void language plpgsql security definer as $$
begin
  if not is_series_manager(p_series_id) then raise exception 'FORBIDDEN'; end if;

  delete from series_tournaments
  where series_id = p_series_id and tournament_id = p_tournament_id;

  perform _audit(p_tournament_id, 'remove_tournament_from_series', 'series', p_series_id,
    jsonb_build_object('series_id', p_series_id));

  perform _recalculate_series_standings(p_series_id);
end $$;

-- ------------------------------------------------------------
-- 7. Tabela de pontos (substituição atômica)
-- ------------------------------------------------------------
-- p_rules: [{"place": 1, "points": 10}, ...]. Substitui a tabela inteira —
-- editar linha a linha pelo cliente deixaria estado intermediário visível na
-- classificação pública entre dois saves.
create or replace function set_series_points_rules(p_series_id uuid, p_rules jsonb)
returns int language plpgsql security definer as $$
declare
  v_count int;
begin
  if not is_series_manager(p_series_id) then raise exception 'FORBIDDEN'; end if;

  delete from series_points_rules where series_id = p_series_id;

  insert into series_points_rules (series_id, place, points)
  select p_series_id, (r->>'place')::smallint, (r->>'points')::numeric
  from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) r
  where (r->>'place')::smallint > 0;

  select count(*) into v_count from series_points_rules where series_id = p_series_id;

  perform _recalculate_series_standings(p_series_id);
  return v_count;
end $$;

-- ------------------------------------------------------------
-- 8. Leitura: escopos disponíveis
-- ------------------------------------------------------------
-- `events` permite a UI avisar quando um escopo aparece em uma etapa só —
-- sintoma clássico de classificação escrita com nome diferente entre etapas
-- ("Sub 12" numa, "Sub-12" na outra), que o casamento por nome normalizado
-- não tem como adivinhar.
drop function if exists get_series_scopes(uuid);
create or replace function get_series_scopes(p_series_id uuid)
returns table (
  scope_key  text,
  scope_name text,
  events     smallint,
  players    smallint
) language sql stable security definer as $$
  select
    a.scope_key,
    min(a.scope_name),
    count(distinct a.tournament_id)::smallint,
    count(distinct a.identity_key)::smallint
  from series_points_awarded a
  where a.series_id = p_series_id
  group by a.scope_key
  order by (a.scope_key = '__absoluto__') desc, min(a.scope_name);
$$;

-- ------------------------------------------------------------
-- 9. Leitura: a classificação da série
-- ------------------------------------------------------------
drop function if exists get_series_standings(uuid, text);
create or replace function get_series_standings(p_series_id uuid, p_scope_key text)
returns table (
  rank         smallint,
  identity_key text,
  player_id    uuid,
  full_name    text,
  federation   text,
  state        text,
  rating_std   smallint,
  points       numeric,
  events       smallint,
  best_place   smallint,
  chess_points numeric
) language plpgsql stable security definer as $$
declare
  v_order     text[];
  v_order_sql text;
begin
  select s.tiebreak_order into v_order from tournament_series s where s.id = p_series_id;

  -- Whitelist própria da série (domínio diferente do desempate de xadrez).
  select coalesce(nullif(string_agg(col, ', '), ''),
                  'agg.events desc, agg.best_place asc, agg.chess_points desc')
    into v_order_sql
  from (
    select case tb
      when 'events'       then 'agg.events desc'
      when 'best_place'   then 'agg.best_place asc'
      when 'chess_points' then 'agg.chess_points desc'
    end as col
    from unnest(coalesce(v_order, '{}')) as tb
  ) x
  where col is not null;

  return query execute format($f$
    with agg as (
      select
        a.identity_key,
        -- Representante: a linha mais recente do jogador na série (nome e
        -- rating podem ter sido corrigidos entre etapas).
        (array_agg(a.player_id order by t.start_date desc nulls last))[1] as player_id,
        sum(a.points)                          as points,
        count(distinct a.tournament_id)::smallint as events,
        min(a.place)::smallint                 as best_place,
        sum(a.chess_points)                    as chess_points
      from series_points_awarded a
      join tournaments t on t.id = a.tournament_id
      where a.series_id = $1 and a.scope_key = $2
      group by a.identity_key
    )
    select
      (row_number() over (order by agg.points desc, %s))::smallint,
      agg.identity_key,
      agg.player_id,
      pl.full_name,
      pl.federation,
      pl.state,
      pl.rating_std,
      agg.points,
      agg.events,
      agg.best_place,
      agg.chess_points
    from agg
    join players pl on pl.id = agg.player_id
    order by agg.points desc, %s
  $f$, v_order_sql, v_order_sql) using p_series_id, p_scope_key;
end $$;

-- ------------------------------------------------------------
-- 10. Leitura: detalhamento de um jogador etapa a etapa
-- ------------------------------------------------------------
-- É o que transforma "42 pontos" em algo verificável pelo jogador.
drop function if exists get_series_player_breakdown(uuid, text, text);
create or replace function get_series_player_breakdown(
  p_series_id uuid, p_identity_key text, p_scope_key text
)
returns table (
  tournament_id      uuid,
  tournament_slug    text,
  tournament_name    text,
  label              text,
  start_date         date,
  pairing_group_name text,
  place              smallint,
  points             numeric,
  chess_points       numeric
) language sql stable security definer as $$
  select
    a.tournament_id,
    t.slug,
    t.name,
    st.label,
    t.start_date,
    pg.name,
    a.place,
    a.points,
    a.chess_points
  from series_points_awarded a
  join tournaments t on t.id = a.tournament_id
  left join series_tournaments st
    on st.series_id = a.series_id and st.tournament_id = a.tournament_id
  left join pairing_groups pg on pg.id = a.pairing_group_id
  where a.series_id = p_series_id
    and a.identity_key = p_identity_key
    and a.scope_key = p_scope_key
  order by st.sort_order nulls last, t.start_date;
$$;
