-- ============================================================
-- Chess Viewer - Migration 009: Public read access to tournament_imports
-- ============================================================
-- The tournament page header shows "Sincronizado <relative time>" based on
-- tournament_imports.last_run_at. Until now this was only visible to the
-- tournament owner because the only SELECT policy on tournament_imports
-- required tournaments.created_by = auth.uid(). This migration adds a
-- public SELECT policy restricted to tournaments flagged is_public, so
-- anonymous visitors of public tournament pages can see the sync indicator.

create policy "tournament_imports: public can select for public tournaments"
  on tournament_imports for select
  using (
    exists (
      select 1 from tournaments t
      where t.id = tournament_imports.tournament_id
        and t.is_public = true
    )
  );
