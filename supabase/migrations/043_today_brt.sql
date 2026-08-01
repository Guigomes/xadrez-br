-- ============================================================
-- Chess Viewer - Migration 043: "hoje" em horário de Brasília, não UTC
-- ============================================================
-- Bug real, reportado em produção: organizador publicou um torneio às 23:46
-- do dia 31/07 com start_date = 01/08, e o torneio foi direto pra 'ongoing',
-- pulando 'registration' inteiro — ele nunca conseguiria abrir inscrição.
--
-- Causa: a sessão do Postgres no Supabase roda em UTC, então `current_date`
-- às 23:46 BRT (UTC-3) do dia 31/07 já vale 2026-08-01. A comparação
-- `start_date <= current_date` de next_status_by_date (040) deu true três
-- horas antes da hora. Todo dia, entre 21:00 e 00:00 BRT, o banco inteiro
-- acha que já é amanhã.
--
-- Mesmo defeito estava na policy de insert de inscrição (032): a janela de
-- inscrição abria e fechava 3h adiantada.
--
-- Correção: uma única função `today_brt()` — nenhum lugar volta a usar
-- `current_date` cru pra decidir data de negócio. Fuso fixo em
-- America/Sao_Paulo: o Brasil tem outros fusos (Acre UTC-5, Fernando de
-- Noronha UTC-2), mas horário de Brasília é a referência nacional pra prazo
-- de inscrição, e um fuso por torneio seria complexidade sem demanda.

create or replace function today_brt() returns date
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ------------------------------------------------------------
-- 1. next_status_by_date (redefinida de 040, só troca a fonte de "hoje")
-- ------------------------------------------------------------
create or replace function next_status_by_date(
  p_status tournament_status, p_start_date date, p_registration_end_date date
) returns tournament_status language sql stable as $$
  select case
    when p_status in ('published', 'registration', 'registration_closed')
         and p_start_date <= today_brt()
      then 'ongoing'::tournament_status
    when p_status = 'registration'
         and p_registration_end_date is not null
         and p_registration_end_date < today_brt()
      then 'registration_closed'::tournament_status
    else p_status
  end;
$$;

-- ------------------------------------------------------------
-- 2. Policy de inscrição pública (redefinida de 032, mesma troca)
-- ------------------------------------------------------------
drop policy if exists "tournament_registrations: public can insert during window" on tournament_registrations;
create policy "tournament_registrations: public can insert during window"
  on tournament_registrations for insert
  with check (
    exists (
      select 1 from tournaments t
      where t.id = tournament_registrations.tournament_id
        and t.status = 'registration'
        and (t.registration_start_date is null or t.registration_start_date <= today_brt())
        and (t.registration_end_date   is null or today_brt() <= t.registration_end_date)
    )
  );

-- ------------------------------------------------------------
-- 3. Reparo dos torneios já corrompidos pelo bug
-- ------------------------------------------------------------
-- Quem está 'ongoing' com data de início ainda no futuro e sem nenhuma
-- rodada criada não começou de verdade — só foi empurrado pelo relógio
-- errado. Volta pra 'published' (estado a partir do qual o organizador
-- avança no stepper como quiser). A checagem de rodadas é o que torna isso
-- seguro: torneio realmente em andamento tem rodada e não é tocado.
update tournaments t
set status = 'published'
where t.status = 'ongoing'
  and t.start_date > today_brt()
  and not exists (select 1 from rounds r where r.tournament_id = t.id);
