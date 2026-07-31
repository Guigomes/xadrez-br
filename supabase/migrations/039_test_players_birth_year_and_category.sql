-- ============================================================
-- Chess Viewer - Migration 039: idade e classificação nos jogadores de teste
-- ============================================================
-- generate_test_players (024) nunca setava players.birth_year nem
-- tournament_players.category_id — o participante de teste nascia sem idade
-- e sem classificação, porque essa função insere direto em
-- tournament_players sem passar por approve_registration (única RPC que
-- hoje chama derive_player_category). Corrige as duas lacunas.
-- Idempotente.

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
  v_tp_id uuid;
  i int;
begin
  if auth_user_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  if p_count < 1 or p_count > 300 then raise exception 'INVALID_COUNT'; end if;
  if not exists (select 1 from pairing_groups where id = p_group_id and tournament_id = p_tournament_id) then
    raise exception 'GROUP_NOT_FOUND';
  end if;

  for i in 1..p_count loop
    v_name := v_first[1 + floor(random() * array_length(v_first, 1))::int]
      || ' ' || v_last[1 + floor(random() * array_length(v_last, 1))::int]
      || ' (T' || (100 + floor(random() * 900)::int) || ')';

    -- idade espalhada entre 8 e 70 anos, pra cobrir tanto categorias de
    -- base (Sub-XX) quanto o Absoluto/Sênior nos presets de classificação.
    insert into players (full_name, sex, rating_std, federation, birth_year, is_test)
    values (
      v_name,
      case when random() < 0.5 then 'm' else 'w' end,
      600 + floor(random() * 1800)::int,
      'BRA',
      extract(year from now())::int - (8 + floor(random() * 62)::int),
      true
    )
    returning id into v_player_id;

    insert into tournament_players (tournament_id, player_id, pairing_group_id, status)
    values (p_tournament_id, v_player_id, p_group_id, 'active')
    returning id into v_tp_id;

    update tournament_players
    set category_id = derive_player_category(p_tournament_id, v_tp_id)
    where id = v_tp_id;
  end loop;

  return p_count;
end $$;
