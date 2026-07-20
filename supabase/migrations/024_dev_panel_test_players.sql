-- ============================================================
-- Chess Viewer - Migration 024: Painel de desenvolvedor (jogadores de teste)
-- ============================================================
-- Gera/limpa participantes fictícios para testar torneios rapidamente.
-- Acesso restrito a role='admin' (checado dentro das RPCs). Idempotente.

alter table players add column if not exists is_test boolean not null default false;
create index if not exists idx_players_is_test on players (is_test) where is_test;

-- Promove a conta do dono do projeto a admin (idempotente) — é quem deve
-- acessar o painel de desenvolvedor.
update user_profiles set role = 'admin'
where email = 'guigomes.ti@gmail.com' and role <> 'admin';

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

    insert into players (full_name, sex, rating_std, federation, is_test)
    values (
      v_name,
      case when random() < 0.5 then 'm' else 'w' end,
      600 + floor(random() * 1800)::int,
      'BRA',
      true
    )
    returning id into v_player_id;

    insert into tournament_players (tournament_id, player_id, pairing_group_id, status)
    values (p_tournament_id, v_player_id, p_group_id, 'active');
  end loop;

  return p_count;
end $$;

create or replace function cleanup_test_players()
returns int language plpgsql security definer as $$
declare
  v_count int;
begin
  if auth_user_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;

  delete from pairings
  where white_tp_id in (select tp.id from tournament_players tp join players p on p.id = tp.player_id where p.is_test)
     or black_tp_id in (select tp.id from tournament_players tp join players p on p.id = tp.player_id where p.is_test);

  delete from tournament_players tp
  using players p
  where tp.player_id = p.id and p.is_test;

  with deleted as (delete from players where is_test returning 1)
  select count(*) into v_count from deleted;

  return v_count;
end $$;
