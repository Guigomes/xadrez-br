-- A tabela existia em producao antes de ser versionada nas migrations. O
-- create if not exists fecha essa lacuna para bancos novos sem alterar o atual.
create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tournament_id uuid references tournaments(id) on delete cascade,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade
);

alter table push_subscriptions
  add column if not exists followed_player_ids uuid[] not null default '{}';

alter table push_subscriptions enable row level security;
revoke all on table push_subscriptions from anon, authenticated;

-- NULL significa que a fonte ainda nao foi inspecionada. Zero e um valor
-- valido (categoria cancelada/sem rodada) e nao deve bloquear o resumo global.
alter table tournament_imports
  add column if not exists discovered_rounds_count smallint
  check (discovered_rounds_count is null or discovered_rounds_count >= 0);

update tournament_imports ti
set discovered_rounds_count = coalesce((
  select max(r.round_number)
  from pairing_groups pg
  join rounds r on r.pairing_group_id = pg.id
  where pg.tournament_id = ti.tournament_id
    and ti.pairing_group_name is not null
    and lower(trim(pg.name)) = lower(trim(ti.pairing_group_name))
), (
  select max(r.round_number)
  from rounds r
  where r.tournament_id = ti.tournament_id
    and r.pairing_group_id is null
    and ti.pairing_group_name is null
), 0)
where ti.discovered_rounds_count is null
  and ti.last_run_at is not null;

-- Eventos de push processados. A chave estavel torna o cron idempotente mesmo
-- quando o Chess-Results e consultado varias vezes ou dois imports concorrem.
create table if not exists push_notification_events (
  id uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  pairing_group_id uuid references pairing_groups(id) on delete cascade,
  round_number smallint not null,
  event_type text not null check (
    event_type in ('group_round_started', 'all_rounds_started', 'player_result', 'all_results_finished')
  ),
  event_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_notification_events_tournament_round
  on push_notification_events(tournament_id, round_number, event_type);

alter table push_notification_events enable row level security;

-- Nao ha policies intencionalmente: somente o service role do backend pode
-- registrar ou consultar eventos de entrega.
revoke all on table push_notification_events from anon, authenticated;

-- Rodadas/categorias que ja estavam publicadas antes desta funcionalidade nao
-- devem gerar notificacoes retroativas no primeiro ciclo do worker novo.
insert into push_notification_events (
  tournament_id,
  pairing_group_id,
  round_number,
  event_type,
  event_key
)
select
  r.tournament_id,
  r.pairing_group_id,
  r.round_number,
  'group_round_started',
  'group-round-started:' || r.id
from rounds r
where r.status in ('ongoing', 'finished')
  and exists (select 1 from pairings p where p.round_id = r.id)
on conflict (event_key) do nothing;

-- Resultados ja existentes tambem sao marcados. A chave usa rodada, tabuleiro
-- (ou jogadores quando nao houver tabuleiro) e resultado; uma correcao futura
-- recebe outra chave e pode ser comunicada novamente.
insert into push_notification_events (
  tournament_id,
  pairing_group_id,
  round_number,
  event_type,
  event_key
)
select
  r.tournament_id,
  r.pairing_group_id,
  r.round_number,
  'player_result',
  'player-result:' || r.id || ':' ||
    coalesce(p.board_number::text, coalesce(p.white_tp_id::text, '') || ':' || coalesce(p.black_tp_id::text, '')) ||
    ':' || p.result::text
from pairings p
join rounds r on r.id = p.round_id
where p.result::text <> '*'
on conflict (event_key) do nothing;

-- Para importados, uma categoria entra no resumo se a fonte ja publicou ao
-- menos uma rodada. O processamento agregado so roda ao final do ciclo.
with imported_expected as (
  select
    ti.tournament_id,
    existing_round.round_number,
    count(distinct coalesce(lower(trim(ti.pairing_group_name)), '__ungrouped__'))::int as group_count
  from tournament_imports ti
  join (select distinct tournament_id, round_number from rounds) existing_round
    on existing_round.tournament_id = ti.tournament_id
  where ti.enabled
    and ti.discovered_rounds_count > 0
  group by ti.tournament_id, existing_round.round_number
), native_expected as (
  select
    t.id as tournament_id,
    existing_round.round_number,
    greatest(
      count(distinct pg.id) filter (
        where exists (
          select 1
          from tournament_players tp
          where tp.tournament_id = t.id
            and tp.pairing_group_id = pg.id
            and tp.status = 'active'
        )
      ),
      1
    )::int as group_count
  from tournaments t
  join (select distinct tournament_id, round_number from rounds) existing_round
    on existing_round.tournament_id = t.id
  left join pairing_groups pg on pg.tournament_id = t.id
  where not exists (
    select 1 from tournament_imports ti where ti.tournament_id = t.id and ti.enabled
  )
  group by t.id, existing_round.round_number
), expected as (
  select * from imported_expected
  union all
  select * from native_expected
), round_state as (
  select
    r.tournament_id,
    r.round_number,
    count(distinct coalesce(r.pairing_group_id::text, '__ungrouped__')) filter (
      where r.status in ('ongoing', 'finished')
        and exists (select 1 from pairings p where p.round_id = r.id)
    )::int as started_count,
    count(distinct coalesce(r.pairing_group_id::text, '__ungrouped__')) filter (
      where r.status = 'finished'
        and exists (select 1 from pairings p where p.round_id = r.id)
        and not exists (select 1 from pairings p where p.round_id = r.id and p.result::text = '*')
    )::int as finished_count
  from rounds r
  group by r.tournament_id, r.round_number
)
insert into push_notification_events (
  tournament_id,
  round_number,
  event_type,
  event_key
)
select
  rs.tournament_id,
  rs.round_number,
  event.event_type,
  event.event_key
from round_state rs
join expected e on e.tournament_id = rs.tournament_id and e.round_number = rs.round_number
cross join lateral (
  values
    ('all_rounds_started'::text, 'all-rounds-started:' || rs.tournament_id || ':' || rs.round_number, rs.started_count >= e.group_count),
    ('all_results_finished'::text, 'all-results-finished:' || rs.tournament_id || ':' || rs.round_number, rs.finished_count >= e.group_count)
) as event(event_type, event_key, is_ready)
where event.is_ready
on conflict (event_key) do nothing;
