-- Ausente com 0 ponto é "não emparceirado", não "bye".
--
-- Bye é a sobra do suíço (ponto inteiro) ou a folga pedida que vale ½ ponto. Quem o organizador marca
-- como ausente numa configuração de 0 ponto (bye_kind = 'requested_zero') não foi sorteado para folga:
-- ficou fora do pareamento. O resultado 'not_paired' já existe (077) com o selo "NÃO EMPARC." em todas as
-- telas; a pontuação, os desempates e o TRF seguem pelo is_bye/bye_kind, que não mudam.
--
-- 1) save_round_draft grava 'not_paired' para requested_zero (demais byes continuam 'bye').
-- 2) Corrige as linhas já geradas de torneios nativos. Importados, app e demais tipos de bye não são tocados.

create or replace function save_round_draft(
  p_group_id uuid, p_round_number int, p_pairings jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
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
      case
        when v_item->>'bye_kind' = 'requested_zero' then 'not_paired'::game_result
        when v_item->>'bye_kind' is not null then 'bye'::game_result
        else '*'::game_result
      end,
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

update pairings p
   set result = 'not_paired'
  from tournaments t
 where t.id = p.tournament_id
   and t.mode = 'native'
   and p.is_bye
   and p.bye_kind = 'requested_zero'
   and p.result = 'bye';
