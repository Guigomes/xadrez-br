-- ============================================================
-- Chess Viewer – Migration 002: Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
alter table user_profiles       enable row level security;
alter table players             enable row level security;
alter table tournaments         enable row level security;
alter table tournament_categories enable row level security;
alter table tournament_players  enable row level security;
alter table rounds              enable row level security;
alter table pairings            enable row level security;
alter table standings           enable row level security;
alter table player_follows      enable row level security;

-- ============================================================
-- Helper functions
-- ============================================================

create or replace function auth_user_role()
returns user_role language sql stable security definer as $$
  select role from public.user_profiles where id = auth.uid();
$$;

create or replace function is_tournament_manager(p_tournament_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (
        created_by = auth.uid()
        or auth_user_role() = 'admin'
      )
  );
$$;

-- ============================================================
-- user_profiles
-- ============================================================

-- Users can read their own profile; admins can read all
create policy "profiles_select_own"    on user_profiles for select using (id = auth.uid() or auth_user_role() = 'admin');
create policy "profiles_update_own"    on user_profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Insert handled by trigger, so no insert policy needed for normal users

-- ============================================================
-- players
-- ============================================================

-- Anyone can read players
create policy "players_select_public"   on players for select using (true);
-- Organizers and above can insert / update
create policy "players_insert_auth"     on players for insert with check (
  auth.uid() is not null and auth_user_role() in ('admin', 'organizer', 'arbiter')
);
create policy "players_update_auth"     on players for update using (
  auth.uid() is not null and auth_user_role() in ('admin', 'organizer', 'arbiter')
);

-- ============================================================
-- tournaments
-- ============================================================

-- Public can see published tournaments; owner and admin see all their own
create policy "tournaments_select_public"  on tournaments for select using (
  is_public = true and status != 'draft'
  or created_by = auth.uid()
  or auth_user_role() = 'admin'
);
create policy "tournaments_insert_auth"    on tournaments for insert with check (
  auth.uid() is not null and auth_user_role() in ('admin', 'organizer')
);
create policy "tournaments_update_manager" on tournaments for update using (
  is_tournament_manager(id)
);
create policy "tournaments_delete_manager" on tournaments for delete using (
  is_tournament_manager(id)
);

-- ============================================================
-- tournament_categories
-- ============================================================

create policy "categories_select_public" on tournament_categories for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);
create policy "categories_manage" on tournament_categories for all using (
  is_tournament_manager(tournament_id)
);

-- ============================================================
-- tournament_players
-- ============================================================

create policy "tp_select_public" on tournament_players for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);
create policy "tp_manage" on tournament_players for all using (
  is_tournament_manager(tournament_id)
);
create policy "tp_insert_manage" on tournament_players for insert with check (
  is_tournament_manager(tournament_id)
);

-- ============================================================
-- rounds
-- ============================================================

create policy "rounds_select_public" on rounds for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);
create policy "rounds_manage" on rounds for all using (
  is_tournament_manager(tournament_id)
);
create policy "rounds_insert_manage" on rounds for insert with check (
  is_tournament_manager(tournament_id)
);

-- ============================================================
-- pairings
-- ============================================================

create policy "pairings_select_public" on pairings for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);
create policy "pairings_manage" on pairings for all using (
  is_tournament_manager(tournament_id)
);
create policy "pairings_insert_manage" on pairings for insert with check (
  is_tournament_manager(tournament_id)
);

-- ============================================================
-- standings
-- ============================================================

create policy "standings_select_public" on standings for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);
create policy "standings_manage" on standings for all using (
  is_tournament_manager(tournament_id)
);

-- ============================================================
-- player_follows
-- ============================================================

create policy "follows_select_own"  on player_follows for select using (user_id = auth.uid());
create policy "follows_insert_own"  on player_follows for insert with check (user_id = auth.uid() and auth.uid() is not null);
create policy "follows_delete_own"  on player_follows for delete using (user_id = auth.uid());
