-- ============================================================
-- Chess Viewer - Migration 020: RPCs de ciclo de vida de rodada (F2)
-- ============================================================
-- Design §5.2 + Apêndice B. Todas security definer, com validação de
-- permissão interna e advisory lock por grupo. Idempotente (create or replace).

-- Helper interno de auditoria (não exposto como RPC).
create or replace function _audit(
  p_tournament_id uuid, p_action text, p_entity text, p_entity_id uuid, p_payload jsonb
) returns void language sql security definer as $$
  insert into audit_log (tournament_id, actor, action, entity, entity_id, payload)
  values (p_tournament_id, auth.uid(), p_action, p_entity, p_entity_id, p_payload);
$$;

-- ------------------------------------------------------------
-- save_round_draft: grava/substitui o rascunho gerado pela engine.
-- p_pairings: [{board, white_tp, black_tp|null, bye_kind|null,
--               points_w|null, points_b|null}]
-- ------------------------------------------------------------
create or replace function save_round_draft(
  p_group_id uuid, p_round_number int, p_pairings jsonb
) returns uuid language plpgsql security definer as $$
declare
  v_group    pairing_groups%rowtype;
  v_t        tournaments%rowtype;
  v_round_id uuid;
  v_rounds_count int;
  v_item jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 42));

  select * into v_group from pairing_groups where id = p_group_id;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  select * into v_t from tournaments where id = v_group.tournament_id;

  if not is_tournament_manager(v_t.id) then raise exception 'FORBIDDEN'; end if;
  if v_t.mode <> 'native' then raise exception 'NOT_NATIVE: torneio não é nativo'; end if;

  v_rounds_count := coalesce(v_group.rounds_count, v_t.rounds_count);
  if p_round_number < 1 or p_round_number > v_rounds_count then
    raise exception 'INVALID_ROUND: rodada % fora do intervalo 1..%', p_round_number, v_rounds_count;
  end if;

  if p_round_number > 1 and not exists (
    select 1 from rounds r
    where r.pairing_group_id = p_group_id
      and r.round_number = p_round_number - 1
      and r.status = 'finished'
  ) then
    raise exception 'PREV_ROUND_NOT_FINISHED: rodada % ainda não foi encerrada', p_round_number - 1;
  end if;

  select id into v_round_id from rounds
  where pairing_group_id = p_group_id and round_number = p_round_number;

  if v_round_id is not null then
    if (select status from rounds where id = v_round_id) <> 'draft' then
      raise exception 'INVALID_STATE: rodada % já foi publicada', p_round_number;
    end if;
    delete from pairings where round_id = v_round_id;
  else
    insert into rounds (tournament_id, pairing_group_id, round_number, status)
    values (v_t.id, p_group_id, p_round_number, 'draft')
    returning id into v_round_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_pairings) loop
    insert into pairings (
      tournament_id, round_id, board_number,
      white_tp_id, black_tp_id, result,
      white_points, black_points, is_bye, bye_kind
    ) values (
      v_t.id, v_round_id, (v_item->>'board')::smallint,
      (v_item->>'white_tp')::uuid,
      nullif(v_item->>'black_tp', '')::uuid,
      case when v_item->>'bye_kind' is not null then 'bye'::game_result else '*'::game_result end,
      nullif(v_item->>'points_w', '')::numeric,
      nullif(v_item->>'points_b', '')::numeric,
      v_item->>'bye_kind' is not null,
      nullif(v_item->>'bye_kind', '')::bye_kind
    );
  end loop;

  perform _audit(v_t.id, 'generate_round', 'round', v_round_id,
    jsonb_build_object('round_number', p_round_number, 'pairing_group_id', p_group_id,
                       'pairings_count', jsonb_array_length(p_pairings)));
  return v_round_id;
end $$;

-- ------------------------------------------------------------
-- publish_round: draft → ongoing (visível ao público).
-- ------------------------------------------------------------
create or replace function publish_round(p_round_id uuid)
returns void language plpgsql security definer as $$
declare
  v_round    rounds%rowtype;
  v_unpaired int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_round.pairing_group_id, v_round.tournament_id)::text, 42));

  if not is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status <> 'draft' then raise exception 'INVALID_STATE: rodada não está em rascunho'; end if;

  select count(*) into v_unpaired
  from tournament_players tp
  where tp.pairing_group_id = v_round.pairing_group_id
    and tp.status = 'active'
    and tp.joined_at_round <= v_round.round_number
    and not exists (
      select 1 from pairings p
      where p.round_id = p_round_id
        and (p.white_tp_id = tp.id or p.black_tp_id = tp.id)
    );
  if v_unpaired > 0 then
    raise exception 'UNPAIRED_PLAYERS: % jogador(es) ativo(s) sem mesa', v_unpaired;
  end if;

  update rounds set status = 'ongoing', published_at = now() where id = p_round_id;
  perform _audit(v_round.tournament_id, 'publish_round', 'round', p_round_id,
    jsonb_build_object('round_number', v_round.round_number));
end $$;

-- ------------------------------------------------------------
-- finish_round: ongoing → finished (exige todos os resultados) + recalc.
-- ------------------------------------------------------------
create or replace function finish_round(p_round_id uuid)
returns void language plpgsql security definer as $$
declare
  v_round   rounds%rowtype;
  v_pending int;
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
end $$;

-- ------------------------------------------------------------
-- reopen_round: finished → ongoing (só se a rodada seguinte não existe).
-- ------------------------------------------------------------
create or replace function reopen_round(p_round_id uuid)
returns void language plpgsql security definer as $$
declare
  v_round rounds%rowtype;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_round.pairing_group_id, v_round.tournament_id)::text, 42));

  if not is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status <> 'finished' then raise exception 'INVALID_STATE: rodada não está encerrada'; end if;
  if exists (
    select 1 from rounds r
    where r.pairing_group_id = v_round.pairing_group_id
      and r.round_number = v_round.round_number + 1
  ) then
    raise exception 'NEXT_ROUND_EXISTS: a rodada seguinte já foi gerada';
  end if;

  update rounds set status = 'ongoing' where id = p_round_id;
  perform _audit(v_round.tournament_id, 'reopen_round', 'round', p_round_id,
    jsonb_build_object('round_number', v_round.round_number));
end $$;

-- ------------------------------------------------------------
-- set_pairing_result: lança/corrige resultado; '*' desfaz enquanto ongoing.
-- ------------------------------------------------------------
create or replace function set_pairing_result(p_pairing_id uuid, p_result game_result)
returns void language plpgsql security definer as $$
declare
  v_pairing pairings%rowtype;
  v_round   rounds%rowtype;
  v_w numeric(3,1);
  v_b numeric(3,1);
begin
  select * into v_pairing from pairings where id = p_pairing_id for update;
  if not found then raise exception 'PAIRING_NOT_FOUND'; end if;
  select * into v_round from rounds where id = v_pairing.round_id;

  if not is_tournament_manager(v_pairing.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status = 'draft' then raise exception 'INVALID_STATE: rodada ainda não publicada'; end if;
  if v_pairing.is_bye then raise exception 'INVALID_STATE: bye não recebe resultado'; end if;
  if p_result = 'bye' then raise exception 'INVALID_RESULT'; end if;
  if p_result = '*' and v_round.status = 'finished' then
    raise exception 'INVALID_STATE: use reopen_round para reabrir a rodada';
  end if;

  select case p_result
           when '1-0' then 1.0 when '0-1' then 0.0 when '1/2-1/2' then 0.5
           when 'forfeit_white' then 0.0 when 'forfeit_black' then 1.0
           when 'double_forfeit' then 0.0 else null end,
         case p_result
           when '1-0' then 0.0 when '0-1' then 1.0 when '1/2-1/2' then 0.5
           when 'forfeit_white' then 1.0 when 'forfeit_black' then 0.0
           when 'double_forfeit' then 0.0 else null end
  into v_w, v_b;

  update pairings set result = p_result, white_points = v_w, black_points = v_b
  where id = p_pairing_id;

  perform _audit(v_pairing.tournament_id, 'set_result', 'pairing', p_pairing_id,
    jsonb_build_object('board', v_pairing.board_number,
                       'before', v_pairing.result, 'after', p_result));

  if v_round.status = 'finished' then
    perform recalculate_standings(v_pairing.tournament_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- swap_draft_players: edição manual do rascunho.
-- p_moves: [{pairing_id, white_tp, black_tp|null}]
-- ------------------------------------------------------------
create or replace function swap_draft_players(p_round_id uuid, p_moves jsonb)
returns void language plpgsql security definer as $$
declare
  v_round rounds%rowtype;
  v_item  jsonb;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if not is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status <> 'draft' then raise exception 'INVALID_STATE: só rascunhos podem ser editados'; end if;

  for v_item in select * from jsonb_array_elements(p_moves) loop
    update pairings set
      white_tp_id = (v_item->>'white_tp')::uuid,
      black_tp_id = nullif(v_item->>'black_tp', '')::uuid,
      manual_override = true
    where id = (v_item->>'pairing_id')::uuid and round_id = p_round_id;
  end loop;

  perform _audit(v_round.tournament_id, 'swap_pairing', 'round', p_round_id,
    jsonb_build_object('round_number', v_round.round_number, 'moves', p_moves));
end $$;

-- ------------------------------------------------------------
-- generate_initial_ranking: seed por rating (rating_kind) + nome.
-- Bloqueado após a rodada 1 sair do rascunho.
-- ------------------------------------------------------------
create or replace function generate_initial_ranking(p_group_id uuid)
returns void language plpgsql security definer as $$
declare
  v_group pairing_groups%rowtype;
  v_t     tournaments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 42));

  select * into v_group from pairing_groups where id = p_group_id;
  if not found then raise exception 'GROUP_NOT_FOUND'; end if;
  select * into v_t from tournaments where id = v_group.tournament_id;
  if not is_tournament_manager(v_t.id) then raise exception 'FORBIDDEN'; end if;
  if exists (
    select 1 from rounds r
    where r.pairing_group_id = p_group_id and r.status <> 'draft'
  ) then
    raise exception 'INVALID_STATE: ranking inicial congelado (rodada já publicada)';
  end if;

  update tournament_players set initial_ranking = null
  where pairing_group_id = p_group_id;

  with seeded as (
    select tp.id,
      row_number() over (
        order by
          case v_t.rating_kind
            when 'std' then pl.rating_std
            when 'rpd' then pl.rating_rpd
            when 'blz' then pl.rating_blz
          end desc nulls last,
          pl.full_name asc
      ) as rn
    from tournament_players tp
    join players pl on pl.id = tp.player_id
    where tp.pairing_group_id = p_group_id and tp.status = 'active'
  )
  update tournament_players tp set initial_ranking = s.rn
  from seeded s where s.id = tp.id;

  perform _audit(v_t.id, 'generate_initial_ranking', 'pairing_group', p_group_id, null);
end $$;

-- ------------------------------------------------------------
-- approve_registration: inscrição → player global + tournament_player.
-- Substitui o fluxo client-side de use-registrations (mais atômico).
-- ------------------------------------------------------------
create or replace function approve_registration(p_registration_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_reg tournament_registrations%rowtype;
  v_t   tournaments%rowtype;
  v_player_id uuid;
  v_tp_id     uuid;
  v_join_round smallint := 1;
  v_round record;
begin
  select * into v_reg from tournament_registrations where id = p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  select * into v_t from tournaments where id = v_reg.tournament_id;
  if not is_tournament_organizer(v_t.id) then raise exception 'FORBIDDEN'; end if;
  if v_reg.status <> 'pending' then raise exception 'INVALID_STATE: inscrição não está pendente'; end if;

  -- find-or-create player: CBX → FIDE → nome exato
  if v_reg.cbx_id is not null then
    select id into v_player_id from players where cbx_id = v_reg.cbx_id limit 1;
  end if;
  if v_player_id is null and v_reg.fide_id is not null then
    select id into v_player_id from players where fide_id = v_reg.fide_id limit 1;
  end if;
  if v_player_id is null then
    select id into v_player_id from players
    where lower(full_name) = lower(trim(v_reg.full_name)) limit 1;
  end if;
  if v_player_id is null then
    insert into players (full_name, birth_year, city, federation, fide_id, cbx_id, rating_std)
    values (trim(v_reg.full_name), v_reg.birth_year, v_reg.city, v_reg.federation,
            v_reg.fide_id, v_reg.cbx_id, v_reg.rating_std)
    returning id into v_player_id;
  end if;

  -- entrada tardia: entra na próxima rodada do grupo
  if v_t.status = 'ongoing' then
    select coalesce(max(r.round_number), 0) + 1 into v_join_round
    from rounds r
    where r.tournament_id = v_t.id
      and (v_reg.pairing_group_id is null or r.pairing_group_id = v_reg.pairing_group_id)
      and r.status <> 'draft';
  end if;

  select id into v_tp_id from tournament_players
  where tournament_id = v_t.id and player_id = v_player_id;
  if v_tp_id is null then
    insert into tournament_players (tournament_id, player_id, pairing_group_id, status, joined_at_round)
    values (v_t.id, v_player_id, v_reg.pairing_group_id, 'active', v_join_round)
    returning id into v_tp_id;

    -- byes de 0 ponto nas rodadas já disputadas (entrada tardia)
    for v_round in
      select r.id from rounds r
      where r.tournament_id = v_t.id
        and (v_reg.pairing_group_id is null or r.pairing_group_id = v_reg.pairing_group_id)
        and r.status in ('ongoing', 'finished')
    loop
      insert into pairings (tournament_id, round_id, white_tp_id, result,
                            white_points, is_bye, bye_kind)
      values (v_t.id, v_round.id, v_tp_id, 'bye', 0, true, 'late_entry');
    end loop;
  end if;

  update tournament_registrations set
    status = 'approved', player_id = v_player_id, tournament_player_id = v_tp_id,
    approved_by = auth.uid(), approved_at = now()
  where id = p_registration_id;

  perform _audit(v_t.id, 'approve_registration', 'registration', p_registration_id,
    jsonb_build_object('tp_id', v_tp_id, 'player_id', v_player_id, 'joined_at_round', v_join_round));
  return v_tp_id;
end $$;
