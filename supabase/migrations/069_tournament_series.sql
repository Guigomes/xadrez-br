-- ============================================================
-- Migration 069: séries de torneios (festivais / circuitos)
-- ============================================================
-- O sistema só conhecia torneio isolado. O único "festival" real do banco foi
-- modelado como UM torneio com 7 grupos de emparceiramento
-- (scripts/import-festival-crianca-dourados.mjs) — contorno, não modelo: os
-- jogos de cada grupo eram de fato eventos distintos, com inscrição, ritmo e
-- premiação próprios.
--
-- Uma série agrupa N torneios (etapas) e tem classificação acumulada própria:
-- a colocação em cada etapa vira pontos de série ("1º = 10, 2º = 8, 3º = 6…").
--
-- Decisões de modelagem que valem registrar:
--
-- 1. UMA entidade genérica. "Festival" e "circuito" são a mesma coisa
--    estruturalmente (vários torneios + um ranking somado); a diferença é
--    editorial (mesmo local/semana vs. etapas ao longo do ano) e não muda uma
--    linha de código. Sem coluna de tipo.
--
-- 2. Vínculo N:N (series_tournaments), não FK em tournaments. Um torneio pode
--    ser etapa do circuito estadual E parte do festival de julho ao mesmo
--    tempo — custo estrutural zero, e evita a migration de "agora precisa ser
--    N:N" depois.
--
-- 3. O PADRÃO DE CLASSIFICAÇÃO É CONTRATO DA SÉRIE
--    (tournament_series.classification_dimensions). Se a série classifica por
--    idade, toda etapa classifica por idade — senão o ranking por categoria
--    seria a soma de coisas incomparáveis (Sub-12 numa etapa, faixa de rating
--    na outra). Validado em add_tournament_to_series, não por trigger, pra dar
--    mensagem de erro acionável na tela em vez de violação de constraint.
--
-- 4. A colocação que vale pontos é apurada DENTRO DO GRUPO DE EMPARCEIRAMENTO.
--    `standings.rank` já é por grupo (migration 023, `partition by
--    pairing_group_id`) — não existe "1º lugar do torneio" quando o organizador
--    divide o evento em grupos que pareiam separado, e inventar um exigiria
--    ordenar entre jogadores que nunca se enfrentaram. Torneio de grupo único
--    (o default de lib/utils/create-tournament-setup.ts) cai no caso trivial.
--
-- O cálculo em si e as funções de leitura estão na migration 070.

-- ------------------------------------------------------------
-- 1. Enum de status
-- ------------------------------------------------------------
-- Mais enxuto que tournament_status de propósito: série não tem inscrição nem
-- rodada, então draft/published/finished cobre todo o ciclo. Enum novo (não
-- `alter type ... add value`), então pode ser criado e usado nesta mesma
-- migration.
do $$ begin
  create type series_status as enum ('draft', 'published', 'finished');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. tournament_series
-- ------------------------------------------------------------
create table if not exists tournament_series (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  description    text,
  start_date     date,
  end_date       date,
  city           text,
  state          char(2),
  organizer_name text,
  banner_url     text,
  status         series_status not null default 'draft',

  -- Contrato de classificação (ver nota 3 no cabeçalho). Mesmo domínio de
  -- tournaments.classification_dimensions (migration 035).
  classification_dimensions text[] not null default '{}',

  -- Espelha tournaments.has_absolute_classification (migration 065): a série
  -- pode premiar só as faixas, sem ranking transversal.
  has_absolute_classification boolean not null default true,

  -- Colocação que não aparece em series_points_rules vale isto. Existe pra que
  -- "todo mundo que participou ganha 1 ponto de presença" seja configurável
  -- sem precisar cadastrar 200 linhas de regra.
  points_outside_table numeric(6,2) not null default 0,

  -- Desempate da classificação da série. Domínio próprio (não são os
  -- desempates de xadrez do torneio): quantas etapas disputou, melhor
  -- colocação individual, soma dos pontos de xadrez.
  tiebreak_order text[] not null default '{events,best_place,chess_points}',

  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint tournament_series_dates_coherent check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

do $$ begin
  alter table tournament_series
    add constraint tournament_series_dimensions_check
    check (classification_dimensions <@ array['age', 'rating', 'sex']);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tournament_series
    add constraint tournament_series_tiebreak_check
    check (tiebreak_order <@ array['events', 'best_place', 'chess_points']);
exception when duplicate_object then null; end $$;

-- O `unique` do slug já cria índice — não duplicar.
create index if not exists idx_series_status_start on tournament_series (status, start_date desc);
create index if not exists idx_series_created_by on tournament_series (created_by);

drop trigger if exists set_tournament_series_updated_at on tournament_series;
create trigger set_tournament_series_updated_at before update on tournament_series
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 3. series_points_rules — a tabela de pontos por colocação
-- ------------------------------------------------------------
-- Tabela em vez de jsonb em tournament_series porque a UI edita linha a linha
-- e porque `place > 0` e a unicidade por colocação são checáveis no banco.
create table if not exists series_points_rules (
  id        uuid primary key default gen_random_uuid(),
  series_id uuid not null references tournament_series(id) on delete cascade,
  place     smallint not null check (place > 0),
  points    numeric(6,2) not null,
  unique (series_id, place)
);

-- ------------------------------------------------------------
-- 4. series_tournaments — o vínculo N:N
-- ------------------------------------------------------------
create table if not exists series_tournaments (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references tournament_series(id) on delete cascade,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  -- Rótulo editorial da etapa ("Etapa 1", "Aberto de Blitz"). Nulo = usa o
  -- nome do torneio.
  label         text,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  unique (series_id, tournament_id)
);

create index if not exists idx_series_tournaments_tournament
  on series_tournaments (tournament_id);

-- ------------------------------------------------------------
-- 5. series_points_awarded — o materializado do cálculo
-- ------------------------------------------------------------
-- Uma linha por (etapa × grupo × escopo × jogador). É o que permite a página
-- pública mostrar o detalhamento ("Etapa 2: 3º lugar, 6 pts") em vez de um
-- total sem explicação. A classificação agregada NÃO é materializada — sai de
-- get_series_standings agregando daqui, o que evita um segundo problema de
-- sincronia. Só as funções security definer da 070 escrevem aqui.
create table if not exists series_points_awarded (
  id               uuid primary key default gen_random_uuid(),
  series_id        uuid not null references tournament_series(id) on delete cascade,
  tournament_id    uuid not null references tournaments(id) on delete cascade,
  pairing_group_id uuid references pairing_groups(id) on delete cascade,

  -- Escopo do ranking: '__absoluto__' ou o nome da classificação normalizado
  -- (lower + trim). scope_name guarda o nome original, pra exibição.
  scope_key        text not null,
  scope_name       text not null,

  -- Identidade do jogador ENTRE etapas: 'cbx:<id>' → 'fide:<id>' → 'pid:<uuid>'
  -- (ver series_identity_key na 070). O find-or-create de approve_registration
  -- (035) pode ter criado duas linhas em `players` pra mesma pessoa em etapas
  -- diferentes; agregar por CBX/FIDE junta as duas. player_id fica como
  -- representante daquela etapa, não como chave de agregação.
  identity_key     text not null,
  player_id        uuid not null references players(id) on delete cascade,

  place            smallint not null,
  points           numeric(6,2) not null default 0,
  -- Pontos de xadrez daquela etapa (usado no desempate 'chess_points').
  chess_points     numeric(5,1) not null default 0,

  unique (series_id, tournament_id, pairing_group_id, scope_key, player_id)
);

create index if not exists idx_series_awarded_lookup
  on series_points_awarded (series_id, scope_key);
create index if not exists idx_series_awarded_identity
  on series_points_awarded (series_id, identity_key);

-- ------------------------------------------------------------
-- 6. Helper de permissão
-- ------------------------------------------------------------
-- Espelha is_tournament_manager (migration 002). Série não tem staff delegado
-- nesta fase — se aparecer, o lugar de estender é aqui, como a 018 fez com o
-- helper de torneio.
create or replace function is_series_manager(p_series_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.tournament_series
    where id = p_series_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  );
$$;

-- ------------------------------------------------------------
-- 7. RLS
-- ------------------------------------------------------------
-- Visibilidade pública = "não é rascunho", mesma regra que a 032 adotou pros
-- torneios (público vê publicado; rascunho é só de quem gerencia).
alter table tournament_series     enable row level security;
alter table series_points_rules   enable row level security;
alter table series_tournaments    enable row level security;
alter table series_points_awarded enable row level security;

drop policy if exists "series_select_public"  on tournament_series;
drop policy if exists "series_select_manager" on tournament_series;
drop policy if exists "series_write_manager"  on tournament_series;
drop policy if exists "series_insert_organizer" on tournament_series;

create policy "series_select_public" on tournament_series
  for select using (status <> 'draft');

create policy "series_select_manager" on tournament_series
  for select using (created_by = auth.uid() or auth_user_role() = 'admin');

-- Insert é separado do resto porque na hora de inserir ainda não existe linha
-- pra is_series_manager consultar — a guarda é a capacidade global.
create policy "series_insert_organizer" on tournament_series
  for insert with check (created_by = auth.uid() and is_organizer_or_admin());

create policy "series_write_manager" on tournament_series
  for update using (is_series_manager(id)) with check (is_series_manager(id));

drop policy if exists "series_delete_manager" on tournament_series;
create policy "series_delete_manager" on tournament_series
  for delete using (is_series_manager(id));

-- Tabelas filhas: leem junto com a série, escrevem só quem gerencia.
drop policy if exists "series_rules_select" on series_points_rules;
drop policy if exists "series_rules_write"  on series_points_rules;

create policy "series_rules_select" on series_points_rules
  for select using (
    exists (select 1 from tournament_series s where s.id = series_id and s.status <> 'draft')
    or is_series_manager(series_id)
  );

create policy "series_rules_write" on series_points_rules
  for all using (is_series_manager(series_id)) with check (is_series_manager(series_id));

drop policy if exists "series_tournaments_select" on series_tournaments;
drop policy if exists "series_tournaments_write"  on series_tournaments;

create policy "series_tournaments_select" on series_tournaments
  for select using (
    exists (select 1 from tournament_series s where s.id = series_id and s.status <> 'draft')
    or is_series_manager(series_id)
  );

-- Existe pra desvincular/reordenar direto; o vínculo NOVO passa por
-- add_tournament_to_series (070), que valida o contrato de classificação.
create policy "series_tournaments_write" on series_tournaments
  for all using (is_series_manager(series_id)) with check (is_series_manager(series_id));

-- Só leitura pro cliente: quem escreve é a função de recálculo (security
-- definer, 070). Sem policy de escrita, nem pra quem gerencia — ranking
-- editado à mão seria mentira sobre o resultado das etapas.
drop policy if exists "series_awarded_select" on series_points_awarded;
create policy "series_awarded_select" on series_points_awarded
  for select using (
    exists (select 1 from tournament_series s where s.id = series_id and s.status <> 'draft')
    or is_series_manager(series_id)
  );

comment on table tournament_series is
  'Festival ou circuito: agrupa torneios (etapas) com classificação acumulada própria.';
comment on column tournament_series.classification_dimensions is
  'Contrato da série — toda etapa vinculada precisa ter o mesmo valor em tournaments.classification_dimensions.';
comment on table series_points_awarded is
  'Materializado do cálculo (migration 070). Escrita só por função security definer.';
