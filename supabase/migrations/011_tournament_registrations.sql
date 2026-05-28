-- ============================================================
-- Chess Viewer - Migration 011: Public tournament registrations
-- ============================================================
-- Adds tournament_registrations, the public-facing registration queue.
-- Kept separate from tournament_players so that contact info (email,
-- phone, payment receipt) doesn't get exposed by the existing public
-- SELECT policies on tournament_players. A registration becomes a
-- tournament_player only when the owner approves it.

create type registration_status as enum ('pending', 'approved', 'rejected');

create table tournament_registrations (
  id                    uuid primary key default uuid_generate_v4(),
  tournament_id         uuid not null references tournaments(id) on delete cascade,
  pairing_group_id      uuid     references pairing_groups(id) on delete set null,

  -- Player-facing identification
  full_name             text not null,
  birth_year            int  null check (birth_year is null or birth_year between 1900 and extract(year from now())::int),
  city                  text null,
  federation            text not null default 'BRA',
  fide_id               text null,
  cbx_id                text null,
  rating_std            int  null check (rating_std is null or rating_std between 0 and 3500),

  -- Contact (private — never exposed to the public)
  email                 text null,
  phone                 text null,

  -- Payment proof uploaded to Supabase Storage. Holds the storage path
  -- (bucket/key) so the admin UI can fetch via a signed URL.
  payment_receipt_path  text null,

  -- Approval lifecycle
  status                registration_status not null default 'pending',
  player_id             uuid null references players(id) on delete set null,
  tournament_player_id  uuid null references tournament_players(id) on delete set null,
  approved_by           uuid null references auth.users(id) on delete set null,
  approved_at           timestamptz null,
  rejected_reason       text null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_tournament_registrations_tournament on tournament_registrations (tournament_id);
create index idx_tournament_registrations_status     on tournament_registrations (tournament_id, status);

create trigger trg_tournament_registrations_updated_at
  before update on tournament_registrations
  for each row execute procedure set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table tournament_registrations enable row level security;

-- Public INSERT — anyone can submit a registration, but only for a tournament
-- that is currently accepting them. The window is:
--   * tournament is_public AND status = 'registration'
--   * registration_start_date <= today <= registration_end_date (when set)
create policy "tournament_registrations: public can insert during window"
  on tournament_registrations for insert
  with check (
    exists (
      select 1 from tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.is_public = true
        and t.status = 'registration'
        and (t.registration_start_date is null or t.registration_start_date <= current_date)
        and (t.registration_end_date   is null or current_date <= t.registration_end_date)
    )
  );

-- Owner SELECT/UPDATE/DELETE — the tournament organizer manages the queue.
create policy "tournament_registrations: owner can select"
  on tournament_registrations for select
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.created_by = auth.uid()
    )
  );

create policy "tournament_registrations: owner can update"
  on tournament_registrations for update
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.created_by = auth.uid()
    )
  );

create policy "tournament_registrations: owner can delete"
  on tournament_registrations for delete
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.created_by = auth.uid()
    )
  );

-- ============================================================
-- Storage bucket for payment receipts
-- ============================================================
-- Created as a private bucket (the owner reads via signed URLs).
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

-- INSERT: anon and authenticated can upload — receipts always live under
-- <tournament_id>/<file>. We don't gate by registration_id here because the
-- receipt is uploaded BEFORE the row exists (multipart upload happens first,
-- then the path is stored on the row). The registration RLS still gates the
-- row insert itself, so an upload without a matching row is orphaned and
-- harmless.
create policy "payment-receipts: anon can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-receipts'
  );

-- SELECT: only the tournament owner (looked up via the path prefix
-- <tournament_id>/...) can read receipts.
create policy "payment-receipts: owner can read"
  on storage.objects for select
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from tournaments t
      where t.id::text = split_part(name, '/', 1)
        and t.created_by = auth.uid()
    )
  );

create policy "payment-receipts: owner can delete"
  on storage.objects for delete
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from tournaments t
      where t.id::text = split_part(name, '/', 1)
        and t.created_by = auth.uid()
    )
  );
