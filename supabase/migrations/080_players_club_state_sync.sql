-- ============================================================
-- Migration 080: escola/clube no cadastro global do jogador
-- ============================================================
-- `tournament_registrations` já tem `club_or_school` (025) e `state` — mas
-- nenhum dos dois nunca foi copiado pro cadastro global em `players` (só
-- existia lá o `state`, e mesmo esse não era sincronizado por
-- approve_registration). Sem a coluna, a lista pública de participantes
-- nunca tinha o que mostrar em "Escola/Município" além da cidade.
--
-- Mesmo padrão de enriquecimento já usado pros outros campos (birth_year,
-- city, federation, fide_id, cbx_id, rating_std — bug documentado no
-- CLAUDE.md: "approve_registration reaproveitando players por nome sem
-- atualizar dado novo", migration 046): não sobrescreve valor já existente
-- (`coalesce(campo, v_reg.campo)`), só preenche o que estava vazio.
--
-- Idempotente.

alter table players add column if not exists club_or_school text;

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
    insert into players (full_name, birth_year, city, state, federation, fide_id, cbx_id, rating_std, sex, club_or_school)
    values (trim(v_reg.full_name), v_reg.birth_year, v_reg.city, v_reg.state, v_reg.federation,
            v_reg.fide_id, v_reg.cbx_id, v_reg.rating_std, v_reg.sex, v_reg.club_or_school)
    returning id into v_player_id;
  else
    update players set
      sex            = coalesce(sex, v_reg.sex),
      birth_year     = coalesce(birth_year, v_reg.birth_year),
      city           = coalesce(city, v_reg.city),
      state          = coalesce(state, v_reg.state),
      federation     = coalesce(federation, v_reg.federation),
      fide_id        = coalesce(fide_id, v_reg.fide_id),
      cbx_id         = coalesce(cbx_id, v_reg.cbx_id),
      rating_std     = coalesce(rating_std, v_reg.rating_std),
      club_or_school = coalesce(club_or_school, v_reg.club_or_school)
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

    -- Reordena o ranking do grupo se ele ainda não travou (nenhuma rodada
    -- saiu de rascunho) — cobre aprovação depois que o ranking já tinha sido
    -- gerado uma vez, sem exigir clique manual de novo. is_tournament_manager
    -- (checado dentro de generate_initial_ranking) é superset de
    -- is_tournament_organizer (já validado acima), nunca barra aqui.
    if v_group_id is not null and not exists (
      select 1 from rounds r where r.pairing_group_id = v_group_id and r.status <> 'draft'
    ) then
      perform generate_initial_ranking(v_group_id);
    end if;
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
