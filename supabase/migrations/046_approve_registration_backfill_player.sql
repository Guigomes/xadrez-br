-- ============================================================
-- Migration 046: approve_registration backfilla dados do jogador existente
-- ============================================================
-- Bug: quando o find-or-create casava por nome (ou CBX/FIDE) com um
-- "players" já existente, só o sexo era retroalimentado (se nulo). Uma
-- segunda inscrição pro mesmo nome com ano de nascimento/cidade/rating/IDs
-- preenchidos era aprovada reaproveitando o cadastro antigo incompleto —
-- os dados novos eram descartados em silêncio, e a classificação por idade
-- nunca derivava (derive_player_category depende de players.birth_year).
-- Mesmo padrão "só preenche o que está nulo" que já existia pro sexo,
-- agora estendido a birth_year/city/federation/fide_id/cbx_id/rating_std.

create or replace function approve_registration(p_registration_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_reg tournament_registrations%rowtype;
  v_t   tournaments%rowtype;
  v_player_id uuid;
  v_tp_id     uuid;
  v_group_id  uuid;
  v_cat_id    uuid;
  v_start_year int;
  v_age        int;
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
    update players set
      sex        = coalesce(sex, v_reg.sex),
      birth_year = coalesce(birth_year, v_reg.birth_year),
      city       = coalesce(city, v_reg.city),
      federation = coalesce(federation, v_reg.federation),
      fide_id    = coalesce(fide_id, v_reg.fide_id),
      cbx_id     = coalesce(cbx_id, v_reg.cbx_id),
      rating_std = coalesce(rating_std, v_reg.rating_std)
    where id = v_player_id;
  end if;

  -- grupo de pareamento: se o emparceiramento é dividido por uma dimensão
  -- (pairing_split), acha o grupo da faixa daquela dimensão que bate com o
  -- jogador; senão cai no fallback legado (grupo único / grupo informado).
  if v_t.pairing_mode = 'per_category' and v_t.pairing_split is not null then
    if v_t.pairing_split = 'age' then
      select extract(year from v_t.start_date)::int into v_start_year;
      if v_reg.birth_year is not null and v_start_year is not null then
        v_age := v_start_year - v_reg.birth_year;
        select c.pairing_group_id into v_group_id
        from tournament_categories c
        where c.tournament_id = v_t.id and c.pairing_group_id is not null
          and c.min_age is not null and c.max_age is not null
          and v_age between c.min_age and c.max_age
        order by c.sort_order limit 1;
      end if;
    elsif v_t.pairing_split = 'rating' then
      if v_reg.rating_std is not null then
        select c.pairing_group_id into v_group_id
        from tournament_categories c
        where c.tournament_id = v_t.id and c.pairing_group_id is not null
          and (c.min_rating is not null or c.max_rating is not null)
          and v_reg.rating_std between coalesce(c.min_rating, 0) and coalesce(c.max_rating, 32767)
        order by c.sort_order limit 1;
      end if;
    elsif v_t.pairing_split = 'sex' then
      if v_reg.sex is not null then
        select c.pairing_group_id into v_group_id
        from tournament_categories c
        where c.tournament_id = v_t.id and c.pairing_group_id is not null and c.sex = v_reg.sex
        order by c.sort_order limit 1;
      end if;
    end if;
  end if;

  if v_group_id is null and v_reg.category_id is not null then
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
    insert into tournament_players (tournament_id, player_id, pairing_group_id, status, joined_at_round)
    values (v_t.id, v_player_id, v_group_id, 'active', v_join_round)
    returning id into v_tp_id;

    v_cat_id := derive_player_category(v_t.id, v_tp_id);
    update tournament_players set category_id = v_cat_id where id = v_tp_id;

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
    v_cat_id := derive_player_category(v_t.id, v_tp_id);
    update tournament_players set category_id = v_cat_id where id = v_tp_id;
  end if;

  update tournament_registrations set
    status = 'approved', player_id = v_player_id, tournament_player_id = v_tp_id,
    approved_by = auth.uid(), approved_at = now()
  where id = p_registration_id;

  perform _audit(v_t.id, 'approve_registration', 'registration', p_registration_id,
    jsonb_build_object('tp_id', v_tp_id, 'player_id', v_player_id, 'joined_at_round', v_join_round,
                        'category_id', v_cat_id));
  return v_tp_id;
end $$;
