-- ============================================================
-- Chess Viewer - Migration 013: Fix RLS de pairing_groups
-- ============================================================
-- As policies da migration 006 referenciam t.organizer_id, coluna que nunca
-- existiu (a correta é created_by) — em banco novo a 006 falha nessas
-- statements. DROP IF EXISTS cobre tanto bancos onde elas existem (criadas
-- à mão) quanto onde nunca foram criadas.
-- As novas policies usam o helper is_tournament_manager (002), que já
-- contempla owner + admin e será estendido para staff na fase F2.

drop policy if exists "pairing_groups: owner insert" on pairing_groups;
drop policy if exists "pairing_groups: owner update" on pairing_groups;
drop policy if exists "pairing_groups: owner delete" on pairing_groups;

drop policy if exists "pairing_groups: manager insert" on pairing_groups;
drop policy if exists "pairing_groups: manager update" on pairing_groups;
drop policy if exists "pairing_groups: manager delete" on pairing_groups;

create policy "pairing_groups: manager insert"
  on pairing_groups for insert
  with check (is_tournament_manager(tournament_id));

create policy "pairing_groups: manager update"
  on pairing_groups for update
  using (is_tournament_manager(tournament_id));

create policy "pairing_groups: manager delete"
  on pairing_groups for delete
  using (is_tournament_manager(tournament_id));
