-- ============================================================
-- Chess Viewer - Migration 017: Byes solicitados (F2)
-- ============================================================
-- Design §3.5. Idempotente.

create table if not exists requested_byes (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  tp_id          uuid not null references tournament_players(id) on delete cascade,
  round_number   smallint not null,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (tp_id, round_number)
);

create index if not exists idx_requested_byes_tournament
  on requested_byes (tournament_id, round_number);

alter table requested_byes enable row level security;

drop policy if exists "requested_byes: manager all" on requested_byes;
create policy "requested_byes: manager all"
  on requested_byes for all
  using (is_tournament_manager(tournament_id))
  with check (is_tournament_manager(tournament_id));
