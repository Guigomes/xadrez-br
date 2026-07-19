-- ============================================================
-- Chess Viewer - Migration 018: Staff por torneio + permissões (F2)
-- ============================================================
-- Design §3.6. Idempotente.

do $$ begin
  create type staff_role as enum ('organizer', 'arbiter');
exception when duplicate_object then null; end $$;

create table if not exists tournament_staff (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           staff_role not null,
  invited_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists idx_staff_tournament on tournament_staff (tournament_id);
create index if not exists idx_staff_user on tournament_staff (user_id);

-- Estende o helper existente (002): staff (qualquer papel) vira manager.
-- Todas as policies que já usam is_tournament_manager passam a aceitar staff.
create or replace function is_tournament_manager(p_tournament_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id and s.user_id = auth.uid()
  );
$$;

-- Nível organizador (config, staff, inscrições).
create or replace function is_tournament_organizer(p_tournament_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id
      and s.user_id = auth.uid() and s.role = 'organizer'
  );
$$;

-- Matriz de permissão (design §3.6): árbitro NÃO edita/exclui torneio.
drop policy if exists "tournaments_update_manager" on tournaments;
create policy "tournaments_update_manager" on tournaments for update using (
  is_tournament_organizer(id)
);
drop policy if exists "tournaments_delete_manager" on tournaments;
create policy "tournaments_delete_manager" on tournaments for delete using (
  exists (select 1 from tournaments t
          where t.id = tournaments.id
            and (t.created_by = auth.uid() or auth_user_role() = 'admin'))
);

-- Inscrições: gestão passa a organizer (antes: created_by direto, da 011).
drop policy if exists "tournament_registrations: owner can select" on tournament_registrations;
drop policy if exists "tournament_registrations: owner can update" on tournament_registrations;
drop policy if exists "tournament_registrations: owner can delete" on tournament_registrations;
drop policy if exists "tournament_registrations: organizer can select" on tournament_registrations;
drop policy if exists "tournament_registrations: organizer can update" on tournament_registrations;
drop policy if exists "tournament_registrations: organizer can delete" on tournament_registrations;

create policy "tournament_registrations: organizer can select"
  on tournament_registrations for select
  using (is_tournament_organizer(tournament_id));
create policy "tournament_registrations: organizer can update"
  on tournament_registrations for update
  using (is_tournament_organizer(tournament_id));
create policy "tournament_registrations: organizer can delete"
  on tournament_registrations for delete
  using (is_tournament_organizer(tournament_id));

-- RLS da própria tabela de staff: organizer gerencia, staff se enxerga.
alter table tournament_staff enable row level security;

drop policy if exists "tournament_staff: organizer manage" on tournament_staff;
create policy "tournament_staff: organizer manage"
  on tournament_staff for all
  using (is_tournament_organizer(tournament_id))
  with check (is_tournament_organizer(tournament_id));

drop policy if exists "tournament_staff: self select" on tournament_staff;
create policy "tournament_staff: self select"
  on tournament_staff for select
  using (user_id = auth.uid());
