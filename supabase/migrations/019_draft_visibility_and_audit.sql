-- ============================================================
-- Chess Viewer - Migration 019: Rascunho invisível + auditoria (F2)
-- ============================================================
-- Design §3.7. Idempotente.

-- Público nunca vê rodada 'draft' nem seus pareamentos.
drop policy if exists "rounds_select_public" on rounds;
create policy "rounds_select_public" on rounds for select using (
  (status <> 'draft' or is_tournament_manager(tournament_id))
  and exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin'
           or is_tournament_manager(t.id))
  )
);

drop policy if exists "pairings_select_public" on pairings;
create policy "pairings_select_public" on pairings for select using (
  exists (
    select 1 from rounds r
    where r.id = pairings.round_id
      and (r.status <> 'draft' or is_tournament_manager(r.tournament_id))
  )
  and exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or t.created_by = auth.uid() or auth_user_role() = 'admin'
           or is_tournament_manager(t.id))
  )
);

-- Trilha de auditoria — escrita apenas via RPCs security definer.
create table if not exists audit_log (
  id             bigint generated always as identity primary key,
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  actor          uuid,
  action         text not null,
  entity         text not null,
  entity_id      uuid,
  payload        jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_audit_tournament on audit_log (tournament_id, created_at desc);

alter table audit_log enable row level security;

drop policy if exists "audit_log: manager select" on audit_log;
create policy "audit_log: manager select"
  on audit_log for select
  using (is_tournament_manager(tournament_id));
-- (sem policies de insert/update/delete — só security definer escreve)
