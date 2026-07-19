-- ============================================================
-- Chess Viewer - Migration 016: Ciclo de vida de rodada (F2)
-- ============================================================
-- Design §3.4. Idempotente. Obs: o valor 'draft' não pode ser USADO na mesma
-- transação que o cria (regra do Postgres p/ ALTER TYPE ADD VALUE).

alter type round_status add value if not exists 'draft' before 'pending';

do $$ begin
  create type bye_kind as enum ('pairing', 'requested_half', 'requested_zero', 'late_entry');
exception when duplicate_object then null; end $$;

alter table pairings add column if not exists bye_kind bye_kind;
alter table pairings add column if not exists manual_override boolean not null default false;

-- Entrada tardia: primeira rodada em que o jogador participa.
alter table tournament_players add column if not exists joined_at_round smallint not null default 1;

-- Integridade de mesa/jogador por rodada. Dados importados legados podem
-- violar — cada índice é tolerante a falha (fica registrado como NOTICE e a
-- criação pode ser repetida após limpeza).
do $$ begin
  create unique index pairings_unique_board on pairings (round_id, board_number)
    where board_number is not null;
exception
  when duplicate_table then null;
  when others then raise notice 'pairings_unique_board não criado: %', sqlerrm;
end $$;

do $$ begin
  create unique index pairings_unique_white on pairings (round_id, white_tp_id)
    where white_tp_id is not null;
exception
  when duplicate_table then null;
  when others then raise notice 'pairings_unique_white não criado: %', sqlerrm;
end $$;

do $$ begin
  create unique index pairings_unique_black on pairings (round_id, black_tp_id)
    where black_tp_id is not null;
exception
  when duplicate_table then null;
  when others then raise notice 'pairings_unique_black não criado: %', sqlerrm;
end $$;

-- Unicidade do ranking inicial por grupo — só para torneios nativos (trigger,
-- mesmo racional da 015: dados importados não são validados).
create or replace function enforce_native_initial_ranking()
returns trigger language plpgsql as $$
begin
  if new.initial_ranking is not null and new.pairing_group_id is not null
     and exists (select 1 from tournaments t where t.id = new.tournament_id and t.mode = 'native')
     and exists (
       select 1 from tournament_players tp
       where tp.pairing_group_id = new.pairing_group_id
         and tp.initial_ranking = new.initial_ranking
         and tp.id <> new.id)
  then
    raise exception 'initial_ranking % duplicado no grupo', new.initial_ranking
      using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists trg_tp_native_ranking on tournament_players;
create trigger trg_tp_native_ranking
  before insert or update on tournament_players
  for each row execute procedure enforce_native_initial_ranking();
