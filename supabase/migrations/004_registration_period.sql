-- ============================================================
-- Chess Viewer - Migration 004: Tournament Registration Period
-- ============================================================

alter table tournaments
  add column if not exists registration_start_date date,
  add column if not exists registration_end_date date;

alter table tournaments
  drop constraint if exists tournaments_registration_period_chk;

alter table tournaments
  add constraint tournaments_registration_period_chk
  check (
    registration_start_date is null
    or registration_end_date is null
    or registration_start_date <= registration_end_date
  );

alter table tournaments
  drop constraint if exists tournaments_registration_before_start_chk;

alter table tournaments
  add constraint tournaments_registration_before_start_chk
  check (
    registration_end_date is null
    or registration_end_date <= start_date
  );
