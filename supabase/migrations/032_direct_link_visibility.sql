-- ============================================================
-- Migration 032: torneio não-público acessível por link direto
-- ============================================================
-- Conceito: "público" = aparece na LISTA do site (search_tournaments, que
-- filtra is_public = true — inalterado aqui). "Não-público" = fora da lista,
-- mas acessível por quem tem o link. Nenhum exige login para ser visto.
--
-- Antes, a RLS de leitura gateava em `is_public`, então link direto de um
-- torneio não-público dava 404 para anônimos. Aqui o gate passa a ser
-- `status <> 'draft'`: qualquer torneio publicado é visível por link; só o
-- rascunho (draft) continua restrito ao organizador/admin.
--
-- Dados privados de inscrição (tournament_registrations: e-mail, telefone,
-- comprovante) NÃO são afetados — continuam visíveis apenas ao dono.

-- tournaments -------------------------------------------------
drop policy if exists "tournaments_select_public" on tournaments;
create policy "tournaments_select_public" on tournaments for select using (
  status <> 'draft'
  or created_by = auth.uid()
  or auth_user_role() = 'admin'
);

-- tournament_categories --------------------------------------
drop policy if exists "categories_select_public" on tournament_categories;
create policy "categories_select_public" on tournament_categories for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.status <> 'draft' or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);

-- tournament_players -----------------------------------------
drop policy if exists "tp_select_public" on tournament_players;
create policy "tp_select_public" on tournament_players for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.status <> 'draft' or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);

-- rounds (mantém: público nunca vê rodada draft) --------------
drop policy if exists "rounds_select_public" on rounds;
create policy "rounds_select_public" on rounds for select using (
  (status <> 'draft' or is_tournament_manager(tournament_id))
  and exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.status <> 'draft' or t.created_by = auth.uid() or auth_user_role() = 'admin'
           or is_tournament_manager(t.id))
  )
);

-- pairings ----------------------------------------------------
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
      and (t.status <> 'draft' or t.created_by = auth.uid() or auth_user_role() = 'admin'
           or is_tournament_manager(t.id))
  )
);

-- standings ---------------------------------------------------
drop policy if exists "standings_select_public" on standings;
create policy "standings_select_public" on standings for select using (
  exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.status <> 'draft' or t.created_by = auth.uid() or auth_user_role() = 'admin')
  )
);

-- tournament_registrations: inscrição por link também em torneio
-- não-público (unlisted). Continua limitada à janela e ao status
-- 'registration' — só deixa de exigir is_public.
drop policy if exists "tournament_registrations: public can insert during window" on tournament_registrations;
create policy "tournament_registrations: public can insert during window"
  on tournament_registrations for insert
  with check (
    exists (
      select 1 from tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.status = 'registration'
        and (t.registration_start_date is null or t.registration_start_date <= current_date)
        and (t.registration_end_date   is null or current_date <= t.registration_end_date)
    )
  );
