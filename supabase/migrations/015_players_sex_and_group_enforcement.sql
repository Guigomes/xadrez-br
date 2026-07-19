-- ============================================================
-- Chess Viewer - Migration 015: players.sex + grupos em torneios nativos
-- ============================================================
-- Fase F1 dos torneios nativos (docs/design-tecnico-torneios-nativos.md §3.3,
-- com a emenda de 2026-07-19: em vez de NOT NULL global em pairing_group_id,
-- a obrigatoriedade vale APENAS para torneios mode='native', via trigger.
-- Motivo: o cron-import insere tournament_players/rounds com grupo NULL em
-- torneios importados de grupo único — NOT NULL global quebraria o worker, e
-- backfill de grupo "Único" em torneios importados mudaria a UI pública deles.
-- Idempotente: pode ser re-executada sem efeito.

-- Sexo do jogador ('m'/'w', códigos do TRF FIDE) — necessário para categoria
-- Feminino e exigido pelo formato TRF de homologação.
alter table players
  add column if not exists sex char(1);

do $$ begin
  alter table players
    add constraint players_sex_check check (sex in ('m', 'w'));
exception when duplicate_object then null; end $$;

-- Grupos podem ter número de rodadas próprio (ex.: Sub-8 com 5 rodadas num
-- evento de 7). NULL = herda tournaments.rounds_count.
alter table pairing_groups
  add column if not exists rounds_count smallint;

-- Consolidação semântica (RF-2): categorias são recorte de premiação.
comment on column tournament_categories.pairing_group_id is
  'Escopo opcional da premiação (a categoria vale dentro deste grupo). NÃO define pareamento — o grupo do jogador é tournament_players.pairing_group_id.';

-- Enforcement: torneio nativo exige grupo em tournament_players e rounds.
create or replace function enforce_native_pairing_group()
returns trigger language plpgsql as $$
begin
  if new.pairing_group_id is null and exists (
    select 1 from tournaments t
    where t.id = new.tournament_id and t.mode = 'native'
  ) then
    raise exception 'Torneio nativo exige pairing_group_id em %', tg_table_name
      using errcode = '23502';
  end if;
  return new;
end $$;

drop trigger if exists trg_tp_native_group on tournament_players;
create trigger trg_tp_native_group
  before insert or update on tournament_players
  for each row execute procedure enforce_native_pairing_group();

drop trigger if exists trg_rounds_native_group on rounds;
create trigger trg_rounds_native_group
  before insert or update on rounds
  for each row execute procedure enforce_native_pairing_group();
