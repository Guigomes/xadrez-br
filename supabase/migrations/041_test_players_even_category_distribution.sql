-- ============================================================
-- Chess Viewer - Migration 041: jogadores de teste distribuídos por classificação
-- ============================================================
-- generate_test_players (039) já sabe a que grupo de emparceiramento o
-- jogador vai (p_group_id, escolhido no painel de Dev) e tentava herdar a
-- classificação sorteando idade uniforme entre 8 e 70 anos e chamando
-- derive_player_category depois. Na prática isso quase sempre falha: uma
-- faixa como "Sub-17" cobre só 10 dos 63 anos possíveis, então a maioria dos
-- jogadores nascia fora de qualquer faixa configurada e ficava sem
-- classificação — daí "de novo" os participantes de teste nascerem sem
-- classificação definida.
--
-- Agora a função já sabe pra qual classificação cada jogador vai ANTES de
-- gerar idade/sexo: busca as classificações do grupo escolhido (mais as sem
-- grupo definido ainda, mesmo critério de derive_player_category em 035) e
-- distribui os N jogadores igualmente entre elas, round-robin. Idade/sexo
-- (e rating, se a classificação exigir) nascem já dentro da faixa da
-- classificação-alvo, e category_id é atribuído direto — não depende mais de
-- derive_player_category "acertar" por sorte. Sem nenhuma classificação
-- cadastrada nesse grupo, cai no sorteio livre de antes (8–70 anos, sem
-- classificação — comportamento correto quando o torneio não usa
-- classificação nenhuma).

create or replace function generate_test_players(
  p_tournament_id uuid, p_group_id uuid, p_count int
) returns int language plpgsql security definer as $$
declare
  v_first text[] := array['Ana','Bruno','Carla','Daniel','Elisa','Fabio','Gabriela','Hugo',
    'Isabela','Joao','Karina','Lucas','Marina','Nicolas','Olivia','Pedro','Queila','Rafael',
    'Sofia','Thiago','Ursula','Vitor','Wesley','Yara','Zeca'];
  v_last  text[] := array['Silva','Santos','Oliveira','Souza','Costa','Pereira','Almeida',
    'Ferreira','Rodrigues','Gomes','Martins','Araujo','Melo','Barros','Ribeiro'];
  v_name text;
  v_player_id uuid;
  v_start_year int;
  v_cats uuid[];
  v_cat_id uuid;
  v_cat_sex char(1);
  v_cat_min_age smallint;
  v_cat_max_age smallint;
  v_cat_min_rating smallint;
  v_cat_max_rating smallint;
  v_sex char(1);
  v_birth_year int;
  v_rating int;
  i int;
begin
  if auth_user_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_count < 1 or p_count > 300 then raise exception 'INVALID_COUNT'; end if;
  if not exists (select 1 from pairing_groups where id = p_group_id and tournament_id = p_tournament_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  select extract(year from start_date)::int into v_start_year
  from tournaments where id = p_tournament_id;

  -- Mesmo critério de "pertence a este grupo" que derive_player_category (035)
  -- usa: grupo exato, ou classificação ainda sem grupo definido.
  select array_agg(id order by sort_order)
    into v_cats
  from tournament_categories
  where tournament_id = p_tournament_id
    and (pairing_group_id = p_group_id or pairing_group_id is null);

  for i in 1..p_count loop
    v_name := v_first[1 + floor(random() * array_length(v_first, 1))::int]
      || ' ' || v_last[1 + floor(random() * array_length(v_last, 1))::int]
      || ' (T' || (100 + floor(random() * 900)::int) || ')';

    if v_cats is not null and array_length(v_cats, 1) > 0 then
      v_cat_id := v_cats[1 + ((i - 1) % array_length(v_cats, 1))];

      select sex, min_age, max_age, min_rating, max_rating
        into v_cat_sex, v_cat_min_age, v_cat_max_age, v_cat_min_rating, v_cat_max_rating
      from tournament_categories where id = v_cat_id;

      v_sex := coalesce(v_cat_sex, case when random() < 0.5 then 'm' else 'w' end);
      v_birth_year := coalesce(v_start_year, extract(year from now())::int)
        - coalesce(v_cat_min_age, 6)::int
        - floor(random() * (coalesce(v_cat_max_age, 75) - coalesce(v_cat_min_age, 6) + 1))::int;
      v_rating := coalesce(v_cat_min_rating, 600)::int
        + floor(random() * (coalesce(v_cat_max_rating, 2400) - coalesce(v_cat_min_rating, 600) + 1))::int;
    else
      -- Sem classificação cadastrada neste grupo: sorteio livre de sempre,
      -- espalhado entre 8 e 70 anos pra cobrir base e Absoluto/Sênior.
      v_cat_id := null;
      v_sex := case when random() < 0.5 then 'm' else 'w' end;
      v_birth_year := extract(year from now())::int - (8 + floor(random() * 62)::int);
      v_rating := 600 + floor(random() * 1800)::int;
    end if;

    insert into players (full_name, sex, rating_std, federation, birth_year, is_test)
    values (v_name, v_sex, v_rating, 'BRA', v_birth_year, true)
    returning id into v_player_id;

    insert into tournament_players (tournament_id, player_id, pairing_group_id, category_id, status)
    values (p_tournament_id, v_player_id, p_group_id, v_cat_id, 'active');
  end loop;

  return p_count;
end $$;
