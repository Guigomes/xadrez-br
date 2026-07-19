-- ============================================================
-- Chess Viewer - Migration 014: Modo do torneio + config nativa
-- ============================================================
-- Fase F1 dos torneios nativos (docs/design-tecnico-torneios-nativos.md §3.2).
-- Idempotente: pode ser re-executada sem efeito.

do $$ begin
  create type tournament_mode as enum ('native', 'imported');
exception when duplicate_object then null; end $$;

do $$ begin
  create type initial_color as enum ('white1', 'black1');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rating_kind as enum ('std', 'rpd', 'blz');
exception when duplicate_object then null; end $$;

-- Todos os torneios existentes permanecem 'imported' (default);
-- a UI de criação nativa (fase F4) passará a gravar 'native'.
alter table tournaments
  add column if not exists mode tournament_mode not null default 'imported';

-- Pontuação do bye solicitado — decisão de escopo: configurável por torneio.
alter table tournaments
  add column if not exists requested_bye_score numeric(2,1) not null default 0.5;

do $$ begin
  alter table tournaments
    add constraint tournaments_requested_bye_score_check
    check (requested_bye_score in (0.0, 0.5));
exception when duplicate_object then null; end $$;

-- Cor do nº 1 na rodada 1 (sorteio físico) — exigido pelo bbpPairings (XXC).
alter table tournaments
  add column if not exists initial_color initial_color not null default 'white1';

-- Rating usado para seed e para o campo rating do TRF.
alter table tournaments
  add column if not exists rating_kind rating_kind not null default 'std';

-- Ordem de desempates configurável (fase F9 usa; whitelist no check).
alter table tournaments
  add column if not exists tiebreak_order text[] not null
    default '{buchholz,buchholz_cut1,sonneborn_berger}';

do $$ begin
  alter table tournaments
    add constraint tournaments_tiebreak_order_check
    check (tiebreak_order <@ array['buchholz','buchholz_cut1','sonneborn_berger','wins','progressive']::text[]);
exception when duplicate_object then null; end $$;
