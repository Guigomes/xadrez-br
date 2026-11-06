-- Item 2 da análise de arquitetura (docs/analise-arquitetura-2026-11-06.md, achado A2 + índices de FK).
--
-- A2. Policies que chamam auth.uid(), auth_user_role(), is_organizer_or_admin(),
--     is_arbiter_or_admin() ou today_brt() "soltos" podem ser reavaliadas por LINHA.
--     auth_user_role() ainda faz SELECT em user_profiles. Nas leituras públicas mais
--     quentes (tournaments, tournament_players, rounds, pairings, standings,
--     tournament_categories) isso multiplica o custo: user_profiles (26 linhas) tinha
--     755 mil seq scans. Envolver em (select ...) vira InitPlan, calculado uma vez por
--     consulta (aviso auth_rls_initplan do Supabase Advisor).
--
--     NÃO muda quem pode ler/escrever o quê: as funções não têm argumento e não
--     dependem da linha. Cada ALTER POLICY troca só a expressão (USING / WITH CHECK);
--     papéis, comando e permissividade ficam como estão. Funções que recebem a linha
--     (is_tournament_manager(t.id) etc.) ficam como estão.
--
--     Gerado a partir de pg_policies de produção em 2026-11-06 (47 policies), não à
--     mão a partir das migrations antigas. Ficaram de fora as sparring_* (Chess
--     Sparring, outro produto que divide o banco; é dono das próprias policies).
--     Idempotente: cada bloco só roda se a policy existir; reaplicar dá o mesmo texto.
--
-- Índices: FKs sem índice que pesam em join ou na cascata de exclusão de torneio.
--     As demais FKs sem índice (created_by, reviewed_by, author_id…) ficaram de fora
--     de propósito: tabelas pequenas, sem join quente. Tabelas pequenas (máx. ~7,6 mil
--     linhas): CREATE INDEX comum leva instantes; CONCURRENTLY não roda em transação.

-- ---------------------------------------------------------------------------
-- A2 — RLS com InitPlan
-- ---------------------------------------------------------------------------

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_fcm_tokens' and policyname = 'admin_fcm_tokens_own_delete') then
    execute 'alter policy "admin_fcm_tokens_own_delete" on public."admin_fcm_tokens"
  using ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_fcm_tokens' and policyname = 'admin_fcm_tokens_own_update') then
    execute 'alter policy "admin_fcm_tokens_own_update" on public."admin_fcm_tokens"
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_fcm_tokens' and policyname = 'admin_fcm_tokens_own_write') then
    execute 'alter policy "admin_fcm_tokens_own_write" on public."admin_fcm_tokens"
  with check ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_settings' and policyname = 'app_settings_write_admin') then
    execute 'alter policy "app_settings_write_admin" on public."app_settings"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))
  with check ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_insert_admin') then
    execute 'alter policy "chat_messages_insert_admin" on public."chat_messages"
  with check ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_select_admin') then
    execute 'alter policy "chat_messages_select_admin" on public."chat_messages"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_select_own') then
    execute 'alter policy "chat_messages_select_own" on public."chat_messages"
  using ((EXISTS ( SELECT 1
   FROM chat_sessions cs
  WHERE ((cs.id = chat_messages.session_id) AND (cs.user_id = ( SELECT auth.uid() AS uid))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'chat_sessions_select_admin') then
    execute 'alter policy "chat_sessions_select_admin" on public."chat_sessions"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'chat_sessions_select_own') then
    execute 'alter policy "chat_sessions_select_own" on public."chat_sessions"
  using ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_sessions' and policyname = 'chat_sessions_update_admin') then
    execute 'alter policy "chat_sessions_update_admin" on public."chat_sessions"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))
  with check ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'error_logs' and policyname = 'error_logs_delete_admin') then
    execute 'alter policy "error_logs_delete_admin" on public."error_logs"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'error_logs' and policyname = 'error_logs_select_admin') then
    execute 'alter policy "error_logs_select_admin" on public."error_logs"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lite_tournaments' and policyname = 'lite_tournaments_select_own') then
    execute 'alter policy "lite_tournaments_select_own" on public."lite_tournaments"
  using ((owner_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'news' and policyname = 'news_select_admin') then
    execute 'alter policy "news_select_admin" on public."news"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pairings' and policyname = 'pairings_select_public') then
    execute 'alter policy "pairings_select_public" on public."pairings"
  using (((EXISTS ( SELECT 1
   FROM rounds r
  WHERE ((r.id = pairings.round_id) AND ((r.status <> ''draft''::round_status) OR is_tournament_manager(r.tournament_id))))) AND (EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = pairings.tournament_id) AND ((t.status <> ''draft''::tournament_status) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role) OR is_tournament_manager(t.id)))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plan_entitlements' and policyname = 'plan_entitlements_write_admin') then
    execute 'alter policy "plan_entitlements_write_admin" on public."plan_entitlements"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))
  with check ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plans' and policyname = 'plans_write_admin') then
    execute 'alter policy "plans_write_admin" on public."plans"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))
  with check ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_follows' and policyname = 'follows_delete_own') then
    execute 'alter policy "follows_delete_own" on public."player_follows"
  using ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_follows' and policyname = 'follows_insert_own') then
    execute 'alter policy "follows_insert_own" on public."player_follows"
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (( SELECT auth.uid() AS uid) IS NOT NULL)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_follows' and policyname = 'follows_select_own') then
    execute 'alter policy "follows_select_own" on public."player_follows"
  using ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_groups' and policyname = 'player_groups_own') then
    execute 'alter policy "player_groups_own" on public."player_groups"
  using ((owner_id = ( SELECT auth.uid() AS uid)))
  with check ((owner_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'players' and policyname = 'players_insert_auth') then
    execute 'alter policy "players_insert_auth" on public."players"
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT is_organizer_or_admin() AS is_organizer_or_admin) OR ( SELECT is_arbiter_or_admin() AS is_arbiter_or_admin))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'players' and policyname = 'players_update_auth') then
    execute 'alter policy "players_update_auth" on public."players"
  using (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT is_organizer_or_admin() AS is_organizer_or_admin) OR ( SELECT is_arbiter_or_admin() AS is_arbiter_or_admin))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'report_orders' and policyname = 'report_orders_select_own') then
    execute 'alter policy "report_orders_select_own" on public."report_orders"
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rounds' and policyname = 'rounds_select_public') then
    execute 'alter policy "rounds_select_public" on public."rounds"
  using ((((status <> ''draft''::round_status) OR is_tournament_manager(tournament_id)) AND (EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = rounds.tournament_id) AND ((t.status <> ''draft''::tournament_status) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role) OR is_tournament_manager(t.id)))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'standings' and policyname = 'standings_select_public') then
    execute 'alter policy "standings_select_public" on public."standings"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = standings.tournament_id) AND ((t.status <> ''draft''::tournament_status) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_select_own') then
    execute 'alter policy "subscriptions_select_own" on public."subscriptions"
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_alert_deliveries' and policyname = 'tournament_alert_deliveries_own') then
    execute 'alter policy "tournament_alert_deliveries_own" on public."tournament_alert_deliveries"
  using ((EXISTS ( SELECT 1
   FROM tournament_alert_rules r
  WHERE ((r.id = tournament_alert_deliveries.rule_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_alert_rules' and policyname = 'tournament_alert_rules_own') then
    execute 'alter policy "tournament_alert_rules_own" on public."tournament_alert_rules"
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_categories' and policyname = 'categories_select_public') then
    execute 'alter policy "categories_select_public" on public."tournament_categories"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_categories.tournament_id) AND ((t.status <> ''draft''::tournament_status) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_imports' and policyname = 'tournament_imports: owner can delete') then
    execute 'alter policy "tournament_imports: owner can delete" on public."tournament_imports"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_imports.tournament_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_imports' and policyname = 'tournament_imports: owner can insert') then
    execute 'alter policy "tournament_imports: owner can insert" on public."tournament_imports"
  with check ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_imports.tournament_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_imports' and policyname = 'tournament_imports: owner can select') then
    execute 'alter policy "tournament_imports: owner can select" on public."tournament_imports"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_imports.tournament_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_imports' and policyname = 'tournament_imports: owner can update') then
    execute 'alter policy "tournament_imports: owner can update" on public."tournament_imports"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_imports.tournament_id) AND (t.created_by = ( SELECT auth.uid() AS uid))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_payouts' and policyname = 'tournament_payouts_select') then
    execute 'alter policy "tournament_payouts_select" on public."tournament_payouts"
  using (((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role) OR is_tournament_organizer(tournament_id)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_payouts' and policyname = 'tournament_payouts_write_admin') then
    execute 'alter policy "tournament_payouts_write_admin" on public."tournament_payouts"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))
  with check ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_players' and policyname = 'tp_select_public') then
    execute 'alter policy "tp_select_public" on public."tournament_players"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_players.tournament_id) AND ((t.status <> ''draft''::tournament_status) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_registrations' and policyname = 'tournament_registrations: public can insert during window') then
    execute 'alter policy "tournament_registrations: public can insert during window" on public."tournament_registrations"
  with check ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournament_registrations.tournament_id) AND (t.status = ''registration''::tournament_status) AND ((t.registration_start_date IS NULL) OR (t.registration_start_date <= ( SELECT today_brt() AS today_brt))) AND ((t.registration_end_date IS NULL) OR (( SELECT today_brt() AS today_brt) <= t.registration_end_date))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_series' and policyname = 'series_insert_organizer') then
    execute 'alter policy "series_insert_organizer" on public."tournament_series"
  with check (((created_by = ( SELECT auth.uid() AS uid)) AND ( SELECT is_organizer_or_admin() AS is_organizer_or_admin)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_series' and policyname = 'series_select_manager') then
    execute 'alter policy "series_select_manager" on public."tournament_series"
  using (((created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_staff' and policyname = 'tournament_staff: self select') then
    execute 'alter policy "tournament_staff: self select" on public."tournament_staff"
  using ((user_id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournaments' and policyname = 'tournaments_delete_manager') then
    execute 'alter policy "tournaments_delete_manager" on public."tournaments"
  using ((EXISTS ( SELECT 1
   FROM tournaments t
  WHERE ((t.id = tournaments.id) AND ((t.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))))))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournaments' and policyname = 'tournaments_insert_auth') then
    execute 'alter policy "tournaments_insert_auth" on public."tournaments"
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ( SELECT is_organizer_or_admin() AS is_organizer_or_admin)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournaments' and policyname = 'tournaments_select_public') then
    execute 'alter policy "tournaments_select_public" on public."tournaments"
  using (((status <> ''draft''::tournament_status) OR (created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unanswered_questions' and policyname = 'unanswered_questions_select_admin') then
    execute 'alter policy "unanswered_questions_select_admin" on public."unanswered_questions"
  using ((( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'profiles_select_own') then
    execute 'alter policy "profiles_select_own" on public."user_profiles"
  using (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth_user_role() AS auth_user_role) = ''admin''::user_role)))';
  end if;
end $do$;

do $do$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'profiles_update_own') then
    execute 'alter policy "profiles_update_own" on public."user_profiles"
  using ((id = ( SELECT auth.uid() AS uid)))
  with check ((id = ( SELECT auth.uid() AS uid)))';
  end if;
end $do$;

-- ---------------------------------------------------------------------------
-- Índices de FK
-- ---------------------------------------------------------------------------

-- Join de sync_player_scores_from_standings (roda a cada ciclo do robô).
create index if not exists idx_standings_tournament_player on public.standings (tournament_player_id);

-- Inscrições: aprovação, conciliação e SET NULL ao apagar jogador/participante/categoria/grupo.
create index if not exists idx_registrations_player on public.tournament_registrations (player_id);
create index if not exists idx_registrations_tournament_player on public.tournament_registrations (tournament_player_id);
create index if not exists idx_registrations_category on public.tournament_registrations (category_id);
create index if not exists idx_registrations_pairing_group on public.tournament_registrations (pairing_group_id);

-- Participantes por categoria (classificação filtrada; SET NULL ao apagar categoria).
create index if not exists idx_tp_category on public.tournament_players (category_id);

-- Pedidos de relatório (fila do admin por jogador/torneio).
create index if not exists idx_report_orders_player on public.report_orders (player_id);
create index if not exists idx_report_orders_tournament on public.report_orders (tournament_id);
create index if not exists idx_report_orders_history_tournament on public.report_orders (history_tournament_id);

-- Pontos de circuito.
create index if not exists idx_series_points_tournament on public.series_points_awarded (tournament_id);
create index if not exists idx_series_points_player on public.series_points_awarded (player_id);
create index if not exists idx_series_points_pairing_group on public.series_points_awarded (pairing_group_id);

-- Cascata/SET NULL ao excluir torneio (sem índice, cada exclusão varre a tabela inteira).
create index if not exists idx_board_arbiters_tournament on public.board_arbiters (tournament_id);
create index if not exists idx_chat_sessions_tournament on public.chat_sessions (tournament_id);
create index if not exists idx_player_follows_tournament on public.player_follows (tournament_id);
create index if not exists idx_push_subscriptions_tournament on public.push_subscriptions (tournament_id);
create index if not exists idx_lite_tournaments_site_tournament on public.lite_tournaments (site_tournament_id);
