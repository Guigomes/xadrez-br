-- Devolve o encerramento automático do torneio ao finish_round.
--
-- A migration 036 fez finish_round virar o torneio para 'finished' quando todos
-- os grupos de emparceiramento cumprem as rodadas previstas. Em algum momento
-- a função voltou à versão da 020 (só encerra a rodada) — no banco em
-- 2026-11-23 o corpo é o da 020, com o search_path fixo, e nenhum arquivo de
-- migration explica a troca. Sintoma: encerrar a última rodada deixava o
-- torneio "em andamento" e o painel levava à preparação de uma rodada que não
-- existe, em vez da classificação (afterRoundFinishHref). Achado pelo teste de
-- interface e2e/rounds.spec.ts.
--
-- Corpo = 036 + `set search_path` (padrão das funções security definer).
-- Idempotente.

create or replace function public.finish_round(p_round_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
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

  -- Trava a linha do torneio: o advisory lock acima é por grupo, não protege
  -- contra dois grupos terminando ao mesmo tempo.
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
