-- Item 1 da análise de arquitetura (docs/analise-arquitetura-2026-11-06.md, achados A1 e A3).
--
-- A1. Excluir torneio ou conta não pode apagar histórico financeiro em cascata.
--     tournaments -> tournament_registrations (cobrança Asaas, valor pago) e
--     tournaments -> tournament_payouts são ON DELETE CASCADE; user_profiles ->
--     subscriptions e user_profiles -> report_orders também. Um clique em "Excluir
--     torneio" (DELETE /api/admin/tournaments/[slug], só dono ou admin) levaria junto
--     o rastro do dinheiro. Torneio/conta SEM dinheiro continuam excluíveis como antes
--     (o e2e apaga torneios e contas de teste sem cobrança).
--
--     Regra: recusar a exclusão quando existir
--       - torneio: inscrição com cobrança gerada (asaas_payment_id), pagamento
--         (paid_at) ou status paid/refunded; ou repasse registrado;
--       - conta: assinatura (toda linha tem asaas_subscription_id) ou pedido de
--         relatório com cobrança/pagamento.
--     A checagem é trigger BEFORE DELETE, então vale também para a cascata vinda de
--     auth.users -> user_profiles (excluir usuário no painel do Supabase).
--     security definer para a RLS não esconder linhas de quem está excluindo.
--
--     Saída deliberada (limpeza feita por admin, ciente): na mesma transação,
--       set local app.allow_financial_delete = 'on';
--     Para atender pedido de exclusão (LGPD) de quem tem histórico financeiro,
--     anonimizar os dados pessoais em vez de apagar as linhas.
--
--     audit_log continua em cascata de propósito: o torneio com dinheiro, que é o
--     que precisa de trilha, já não pode ser excluído.
--
-- A3. sync_player_scores_from_standings regravava TODAS as linhas do torneio a cada
--     ciclo do robô (hoje a cada 10 min), mesmo sem mudança: tournament_players tinha
--     ~1,3 MB de dado em 19 MB de heap. Agora só atualiza a linha cujo valor mudou.
--     Mesma assinatura e grants; o retorno passa a ser "linhas alteradas" (os
--     chamadores — cron-import/import-standings.ts e recalculate_standings — só olham
--     o erro). O espaço já inchado só volta com VACUUM FULL, que não roda dentro de
--     transação: executar à parte, em horário calmo (ver nota no fim).

-- ---------------------------------------------------------------------------
-- A1
-- ---------------------------------------------------------------------------

create or replace function public.guard_financial_history_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.allow_financial_delete', true), '') = 'on' then
    return old;
  end if;

  if tg_table_name = 'tournaments' then
    if exists (
      select 1
        from public.tournament_registrations r
       where r.tournament_id = old.id
         and (r.asaas_payment_id is not null
              or r.paid_at is not null
              or r.payment_status in ('paid', 'refunded'))
    ) then
      raise exception 'Este torneio tem inscrição com cobrança ou pagamento e não pode ser excluído. Cancele o torneio em vez de excluí-lo.'
        using errcode = 'P0001', hint = 'FINANCIAL_HISTORY';
    end if;

    if exists (select 1 from public.tournament_payouts p where p.tournament_id = old.id) then
      raise exception 'Este torneio tem repasse registrado e não pode ser excluído. Cancele o torneio em vez de excluí-lo.'
        using errcode = 'P0001', hint = 'FINANCIAL_HISTORY';
    end if;

  elsif tg_table_name = 'user_profiles' then
    if exists (select 1 from public.subscriptions s where s.user_id = old.id) then
      raise exception 'Esta conta tem assinatura registrada e não pode ser excluída; anonimize os dados pessoais em vez de apagar.'
        using errcode = 'P0001', hint = 'FINANCIAL_HISTORY';
    end if;

    if exists (
      select 1
        from public.report_orders o
       where o.user_id = old.id
         and (o.asaas_payment_id is not null or o.payment_status in ('paid', 'refunded'))
    ) then
      raise exception 'Esta conta tem pedido de relatório com cobrança ou pagamento e não pode ser excluída; anonimize os dados pessoais em vez de apagar.'
        using errcode = 'P0001', hint = 'FINANCIAL_HISTORY';
    end if;
  end if;

  return old;
end;
$$;

revoke all on function public.guard_financial_history_on_delete() from public, anon, authenticated;

drop trigger if exists trg_guard_financial_history on public.tournaments;
create trigger trg_guard_financial_history
  before delete on public.tournaments
  for each row execute function public.guard_financial_history_on_delete();

drop trigger if exists trg_guard_financial_history on public.user_profiles;
create trigger trg_guard_financial_history
  before delete on public.user_profiles
  for each row execute function public.guard_financial_history_on_delete();

-- Repasse é dinheiro que saiu: além do trigger, a própria FK deixa de cascatear.
alter table public.tournament_payouts
  drop constraint if exists tournament_payouts_tournament_id_fkey;
alter table public.tournament_payouts
  add constraint tournament_payouts_tournament_id_fkey
  foreign key (tournament_id) references public.tournaments(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- A3
-- ---------------------------------------------------------------------------

create or replace function public.sync_player_scores_from_standings(p_tournament_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with updated as (
    update public.tournament_players tp
       set current_score = s.points,
           current_rank = s.rank,
           buchholz = s.buchholz,
           buchholz_cut1 = s.buchholz_cut1,
           sonneborn_berger = s.sonneborn_berger,
           progressive = s.progressive
      from public.standings s
     where s.tournament_player_id = tp.id
       and tp.tournament_id = p_tournament_id
       and s.tournament_id = p_tournament_id
       -- Só regrava o que mudou: evita nova versão da linha (e dos índices) a cada ciclo.
       and (tp.current_score, tp.current_rank, tp.buchholz, tp.buchholz_cut1,
            tp.sonneborn_berger, tp.progressive)
           is distinct from
           (s.points, s.rank, s.buchholz, s.buchholz_cut1,
            s.sonneborn_berger, s.progressive)
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- Nota (fora da transação, manual, uma vez, em horário sem rodada ao vivo):
--   vacuum (full, analyze) public.tournament_players;
-- Trava a tabela durante a cópia (segundos neste tamanho).
