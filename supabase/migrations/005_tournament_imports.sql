-- ============================================================
-- Chess Viewer – Migration 005: Tournament Imports (cron-import)
-- ============================================================
-- Stores the configuration for each tournament that the
-- cron-import Cloud Run Job should sync automatically from
-- chess-results.com. One row per chess-results URL / pairing
-- group combination.

create table tournament_imports (
  id                  uuid primary key default uuid_generate_v4(),
  tournament_id       uuid not null references tournaments(id) on delete cascade,

  -- Full chess-results URL, e.g.:
  -- https://chess-results.com/tnr123.aspx?lan=10
  -- For multi-group tournaments use one row per group (different SNode).
  base_url            text not null,

  -- Optional: name of the pairing group this URL maps to.
  -- Leave null for single-group tournaments.
  pairing_group_name  text,

  enabled             boolean not null default true,

  -- Populated by the cron after each run
  last_run_at         timestamptz,
  last_status         text check (last_status in ('success', 'error')),
  last_message        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Only one URL per tournament + group combination
create unique index tournament_imports_unique_url
  on tournament_imports (tournament_id, base_url, coalesce(pairing_group_name, ''));

-- RLS: only service_role (used by the cron) and admins/organizers can manage imports
alter table tournament_imports enable row level security;

-- Service role bypasses RLS by default — no policy needed for the cron.
-- Frontend admin: tournament owner can read and manage their own imports.
create policy "tournament_imports: owner can select"
  on tournament_imports for select
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_imports.tournament_id
        and t.created_by = auth.uid()
    )
  );

create policy "tournament_imports: owner can insert"
  on tournament_imports for insert
  with check (
    exists (
      select 1 from tournaments t
      where t.id = tournament_imports.tournament_id
        and t.created_by = auth.uid()
    )
  );

create policy "tournament_imports: owner can update"
  on tournament_imports for update
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_imports.tournament_id
        and t.created_by = auth.uid()
    )
  );

create policy "tournament_imports: owner can delete"
  on tournament_imports for delete
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_imports.tournament_id
        and t.created_by = auth.uid()
    )
  );

-- Trigger to keep updated_at in sync
create trigger trg_tournament_imports_updated_at
  before update on tournament_imports
  for each row execute procedure set_updated_at();
