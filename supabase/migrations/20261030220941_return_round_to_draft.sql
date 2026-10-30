-- Explicit, audited reversal of publication for the last native round in a group.
-- Keeps seats, byes, registrations and PGNs; clears entered results only after
-- confirmation and recomputes standings in the same transaction. No backfill.
-- Rollback: remove the UI first, then drop this function; do not undo user actions.
create or replace function public.return_round_to_draft(
  p_round_id uuid, p_discard_results boolean default false
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_round rounds%rowtype;
  v_t tournaments%rowtype;
  v_count integer;
  v_results jsonb;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if not public.is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  select * into v_t from tournaments where id = v_round.tournament_id;
  if v_t.mode <> 'native' then raise exception 'NOT_NATIVE: ação disponível apenas em torneios nativos'; end if;
  if v_t.status = 'cancelled' then raise exception 'INVALID_STATE: torneio cancelado'; end if;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_round.pairing_group_id, v_round.tournament_id)::text, 42));
  if exists (
    select 1 from rounds r where r.tournament_id = v_round.tournament_id
      and r.pairing_group_id is not distinct from v_round.pairing_group_id
      and r.round_number > v_round.round_number
  ) then raise exception 'NEXT_ROUND_EXISTS: só é possível voltar a última rodada do grupo para rascunho'; end if;
  if v_round.status = 'draft' then return 0; end if;
  if v_round.status not in ('ongoing', 'finished') then raise exception 'INVALID_STATE: rodada não publicada'; end if;

  -- Wait for in-flight result submissions before deciding whether explicit
  -- result deletion was acknowledged. A stale dialog cannot erase new results.
  perform 1 from pairings where round_id = p_round_id order by id for update;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
    'pairing_id', id, 'result', result, 'white_points', white_points, 'black_points', black_points
  )), '[]'::jsonb) into v_count, v_results
  from pairings where round_id = p_round_id and not is_bye and result <> '*';
  if v_count > 0 and not coalesce(p_discard_results, false) then
    raise exception 'RESULTS_CONFIRMATION_REQUIRED: já existem % resultado(s); confirme a exclusão para voltar ao rascunho', v_count;
  end if;

  update rounds set status = 'draft', published_at = null where id = p_round_id;
  update pairings set result = '*', white_points = null, black_points = null
    where round_id = p_round_id and not is_bye;
  -- Returning the final round also reopens a previously finished tournament.
  update tournaments set status = 'ongoing' where id = v_round.tournament_id and status = 'finished';
  perform public.recalculate_standings(v_round.tournament_id);
  perform public._audit(v_round.tournament_id, 'return_round_to_draft', 'round', p_round_id,
    jsonb_build_object('round_number', v_round.round_number, 'before_status', v_round.status,
      'before_published_at', v_round.published_at, 'discarded_results_count', v_count,
      'discarded_results', v_results));
  return v_count;
end $$;

revoke all on function public.return_round_to_draft(uuid, boolean) from public, anon;
grant execute on function public.return_round_to_draft(uuid, boolean) to authenticated, service_role;
