-- Creates pairing_groups table and links it to tournament_categories and
-- tournament_players. Required for multi-group tournaments imported via
-- chess-results.com (each SNode = one pairing group).

-- ============================================================
-- pairing_groups
-- ============================================================

create table if not exists pairing_groups (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name          text not null,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_pairing_groups_tournament on pairing_groups (tournament_id);

create trigger trg_pairing_groups_updated
  before update on pairing_groups
  for each row execute procedure set_updated_at();

-- RLS
alter table pairing_groups enable row level security;

-- Anyone can read
create policy "pairing_groups: public read"
  on pairing_groups for select using (true);

-- Authenticated tournament owner can manage
create policy "pairing_groups: owner insert"
  on pairing_groups for insert
  with check (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  );

create policy "pairing_groups: owner update"
  on pairing_groups for update
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  );

create policy "pairing_groups: owner delete"
  on pairing_groups for delete
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_id
        and t.organizer_id = auth.uid()
    )
  );

-- ============================================================
-- Link tournament_categories → pairing_groups
-- ============================================================

alter table tournament_categories
  add column if not exists pairing_group_id uuid references pairing_groups(id) on delete set null;

create index if not exists idx_tournament_categories_group
  on tournament_categories (pairing_group_id);

-- ============================================================
-- Link tournament_players → pairing_groups (direct, fast filter)
-- ============================================================

alter table tournament_players
  add column if not exists pairing_group_id uuid references pairing_groups(id) on delete set null;

create index if not exists idx_tp_pairing_group
  on tournament_players (pairing_group_id);
