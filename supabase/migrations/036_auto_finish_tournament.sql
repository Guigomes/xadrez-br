-- ============================================================
-- Auto-avanço de tournaments.status para 'finished'
-- ============================================================
-- Hoje o avanço de status é 100% manual (botão "Avançar →" em
-- app/admin/tournaments/[slug]/edit/page.tsx). finish_round (020) marca a
-- rodada e recalcula standings, mas nunca olha pro torneio como um todo.
--
-- Um torneio pode ter mais de um pairing_group (ex.: dividido por idade),
-- cada um com sua própria sequência de round_number (reinicia em 1 por
-- grupo — ver 007_rounds_pairing_group.sql) e seu próprio total esperado de
-- rodadas (coalesce(pairing_groups.rounds_count, tournaments.rounds_count),
-- mesmo padrão de save_round_draft). Só dá pra considerar o torneio
-- encerrado quando TODOS os grupos esgotaram suas rodadas esperadas — e só
-- se existir pelo menos um grupo (torneio recém-criado sem grupo nenhum não
-- pode contar como "todos terminaram" por vacuidade).
--
-- Mesma assinatura de finish_round (retorna void) — o cliente não precisa
-- ler nenhum valor novo; a UI reage lendo tournaments.status diretamente.

create or replace function finish_round(p_round_id uuid)
returns void language plpgsql security definer as $$
declare
  v_round      rounds%rowtype;
  v_pending    int;
  v_tournament tournaments%rowtype;
  v_all_done   boolean;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_round.pairing_group_id, v_round.tournament_id)::text, 42));

  if not is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status <> 'ongoing' then raise exception 'INVALID_STATE: rodada não está publicada'; end if;

  select count(*) into v_pending from pairings
  where round_id = p_round_id and result = '*';
  if v_pending > 0 then
    raise exception 'PENDING_RESULTS: % mesa(s) sem resultado', v_pending;
  end if;

  update rounds set status = 'finished' where id = p_round_id;
  perform recalculate_standings(v_round.tournament_id);
  perform _audit(v_round.tournament_id, 'finish_round', 'round', p_round_id,
    jsonb_build_object('round_number', v_round.round_number));

  -- Trava a linha do torneio: o advisory lock acima é por grupo, não
  -- protege contra dois grupos terminando ao mesmo tempo e ambos tentando
  -- decidir se "todos terminaram" com base numa leitura desatualizada.
  select * into v_tournament from tournaments where id = v_round.tournament_id for update;

  select
    exists (select 1 from pairing_groups where tournament_id = v_tournament.id)
    and not exists (
      select 1 from pairing_groups pg
      where pg.tournament_id = v_tournament.id
        and (
          select count(*) from rounds r2
          where r2.pairing_group_id = pg.id and r2.status = 'finished'
        ) < coalesce(pg.rounds_count, v_tournament.rounds_count)
    )
  into v_all_done;

  if v_all_done and v_tournament.status = 'ongoing' then
    update tournaments set status = 'finished' where id = v_tournament.id;
    perform _audit(v_tournament.id, 'auto_finish_tournament', 'tournament', v_tournament.id, '{}'::jsonb);
  end if;
end $$;
