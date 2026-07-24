-- ============================================================
-- Migration 030: alteração manual de pareamento com justificativa
-- ============================================================
-- Regra FIDE C.04: o árbitro pode alterar o pareamento gerado, mas a
-- mudança precisa de justificativa e deve ficar registrada (quem/quando).
--
-- Fluxo novo:
--   * rascunho (draft): NÃO se edita à mão — só regenera ou publica.
--   * publicada (ongoing/finished): pode alterar com justificativa
--     obrigatória; cada alteração vai para audit_log com o autor.
-- Os pares afetados têm o resultado zerado ('*'), pois a partida mudou.

create or replace function override_pairing_players(
  p_round_id uuid, p_moves jsonb, p_justification text
) returns void language plpgsql security definer as $$
declare
  v_round rounds%rowtype;
  v_item  jsonb;
  v_moves jsonb := '[]'::jsonb;
  v_white_name text;
  v_black_name text;
  v_board smallint;
  v_actor_name text;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if not is_tournament_manager(v_round.tournament_id) then raise exception 'FORBIDDEN'; end if;
  if v_round.status = 'draft' then
    raise exception 'INVALID_STATE: rascunho não é editado à mão; regenere ou publique a rodada';
  end if;
  if v_round.status not in ('ongoing', 'finished') then
    raise exception 'INVALID_STATE: rodada não pode ser alterada';
  end if;
  if p_justification is null or length(btrim(p_justification)) < 3 then
    raise exception 'JUSTIFICATION_REQUIRED: informe a justificativa da alteração';
  end if;

  for v_item in select * from jsonb_array_elements(p_moves) loop
    update pairings set
      white_tp_id     = (v_item->>'white_tp')::uuid,
      black_tp_id     = nullif(v_item->>'black_tp', '')::uuid,
      manual_override = true,
      result          = '*',
      white_points    = null,
      black_points    = null
    where id = (v_item->>'pairing_id')::uuid and round_id = p_round_id
    returning board_number into v_board;

    select p.full_name into v_white_name
      from tournament_players tp join players p on p.id = tp.player_id
      where tp.id = (v_item->>'white_tp')::uuid;
    select p.full_name into v_black_name
      from tournament_players tp join players p on p.id = tp.player_id
      where tp.id = nullif(v_item->>'black_tp', '')::uuid;

    v_moves := v_moves || jsonb_build_object(
      'board', v_board,
      'white_name', coalesce(v_white_name, '—'),
      'black_name', coalesce(v_black_name, 'BYE'));
  end loop;

  select full_name into v_actor_name from user_profiles where id = auth.uid();

  perform _audit(v_round.tournament_id, 'override_pairing', 'round', p_round_id,
    jsonb_build_object(
      'round_number', v_round.round_number,
      'justification', btrim(p_justification),
      'actor_name', coalesce(nullif(btrim(v_actor_name), ''), 'Organizador'),
      'moves', v_moves));

  if v_round.status = 'finished' then
    perform recalculate_standings(v_round.tournament_id);
  end if;
end $$;

-- ------------------------------------------------------------
-- get_round_pairings: acrescenta manual_override para a UI marcar
-- mesas alteradas à mão. Return type muda, então drop + recreate.
-- ------------------------------------------------------------
drop function if exists get_round_pairings(uuid);
create or replace function get_round_pairings(p_round_id uuid)
returns table (
  pairing_id       uuid,
  board_number     smallint,
  white_tp_id      uuid,
  white_name       text,
  white_rating     smallint,
  white_rank       smallint,
  white_score      numeric(5,1),
  black_tp_id      uuid,
  black_name       text,
  black_rating     smallint,
  black_rank       smallint,
  black_score      numeric(5,1),
  result           game_result,
  white_points     numeric(3,1),
  black_points     numeric(3,1),
  is_bye           boolean,
  manual_override  boolean
) language sql stable security definer as $$
  select
    p.id,
    p.board_number,
    wtp.id, wpl.full_name, wpl.rating_std, wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'), bpl.rating_std, btp.current_rank, btp.current_score,
    p.result, p.white_points, p.black_points, p.is_bye, p.manual_override
  from pairings p
  join tournament_players wtp on wtp.id = p.white_tp_id
  join players wpl on wpl.id = wtp.player_id
  left join tournament_players btp on btp.id = p.black_tp_id
  left join players bpl on bpl.id = btp.player_id
  where p.round_id = p_round_id
  order by p.board_number asc nulls last;
$$;
