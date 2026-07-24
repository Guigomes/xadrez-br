-- ============================================================
-- Migration 034: classificações (seleção do inscrito) + modo de emparceiramento
-- ============================================================
-- Modelo:
--  * Classificação = tournament_categories. O inscrito seleciona UMA na
--    inscrição (obrigatório quando existe ≥1). Critérios (idade/sexo/rating)
--    são informativos, não validam.
--  * Emparceiramento = pairing_groups, derivado da classificação via
--    tournament_categories.pairing_group_id. Modos:
--      - absolute: 1 grupo único; toda classificação aponta pra ele.
--      - per_category: 1 grupo por classificação (bijeção).
--      - custom: organizador mapeia cada classificação a um grupo.
--  * Na aprovação, tp.pairing_group_id vem do grupo da classificação
--    escolhida (com fallback pro grupo único).

-- Critério informativo de sexo na classificação (idade/rating já existem).
alter table tournament_categories
  add column if not exists sex char(1);
do $$ begin
  alter table tournament_categories
    add constraint tournament_categories_sex_check check (sex in ('m', 'w'));
exception when duplicate_object then null; end $$;

-- Classificação escolhida na inscrição.
alter table tournament_registrations
  add column if not exists category_id uuid references tournament_categories(id) on delete set null;

-- Modo de emparceiramento do torneio.
do $$ begin
  create type pairing_mode as enum ('absolute', 'per_category', 'custom');
exception when duplicate_object then null; end $$;
alter table tournaments
  add column if not exists pairing_mode pairing_mode not null default 'absolute';

-- ------------------------------------------------------------
-- approve_registration: deriva a classificação e o grupo de pareamento.
-- ------------------------------------------------------------
create or replace function approve_registration(p_registration_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_reg tournament_registrations%rowtype;
  v_t   tournaments%rowtype;
  v_player_id uuid;
  v_tp_id     uuid;
  v_group_id  uuid;
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
    insert into players (full_name, birth_year, city, federation, fide_id, cbx_id, rating_std, sex)
    values (trim(v_reg.full_name), v_reg.birth_year, v_reg.city, v_reg.federation,
            v_reg.fide_id, v_reg.cbx_id, v_reg.rating_std, v_reg.sex)
    returning id into v_player_id;
  else
    update players set sex = v_reg.sex
    where id = v_player_id and sex is null and v_reg.sex is not null;
  end if;

  -- grupo de pareamento: classificação → seu grupo; senão grupo informado
  -- (legado); senão grupo único do torneio.
  if v_reg.category_id is not null then
    select pairing_group_id into v_group_id from tournament_categories
    where id = v_reg.category_id and tournament_id = v_t.id;
  end if;
  if v_group_id is null then v_group_id := v_reg.pairing_group_id; end if;
  if v_group_id is null then
    select id into v_group_id from pairing_groups
    where tournament_id = v_t.id order by sort_order limit 1;
  end if;

  -- entrada tardia: entra na próxima rodada do grupo
  if v_t.status = 'ongoing' then
    select coalesce(max(r.round_number), 0) + 1 into v_join_round
    from rounds r
    where r.tournament_id = v_t.id
      and (v_group_id is null or r.pairing_group_id = v_group_id)
      and r.status <> 'draft';
  end if;

  select id into v_tp_id from tournament_players
  where tournament_id = v_t.id and player_id = v_player_id;
  if v_tp_id is null then
    insert into tournament_players (tournament_id, player_id, pairing_group_id, category_id, status, joined_at_round)
    values (v_t.id, v_player_id, v_group_id, v_reg.category_id, 'active', v_join_round)
    returning id into v_tp_id;

    for v_round in
      select r.id from rounds r
      where r.tournament_id = v_t.id
        and (v_group_id is null or r.pairing_group_id = v_group_id)
        and r.status in ('ongoing', 'finished')
    loop
      insert into pairings (tournament_id, round_id, white_tp_id, result,
                            white_points, is_bye, bye_kind)
      values (v_t.id, v_round.id, v_tp_id, 'bye', 0, true, 'late_entry');
    end loop;
  else
    update tournament_players set category_id = v_reg.category_id
    where id = v_tp_id and category_id is null;
  end if;

  update tournament_registrations set
    status = 'approved', player_id = v_player_id, tournament_player_id = v_tp_id,
    approved_by = auth.uid(), approved_at = now()
  where id = p_registration_id;

  perform _audit(v_t.id, 'approve_registration', 'registration', p_registration_id,
    jsonb_build_object('tp_id', v_tp_id, 'player_id', v_player_id, 'joined_at_round', v_join_round));
  return v_tp_id;
end $$;
