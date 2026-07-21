-- ============================================================
-- Chess Viewer - Migration 025: Parametrização de inscrição (RF-11)
-- ============================================================
-- - Organizador define se o comprovante de pagamento é obrigatório.
-- - Valor da inscrição é texto livre (varia por categoria: "R$50 Absoluto
--   / R$30 Sub-14"), não numérico.
-- - Inscrição pública ganha UF e escola/clube de xadrez (opcional).
-- - Rating deixou de ser exigido no formulário público (segue opcional
--   no banco — já era nullable).
-- Idempotente.

alter table tournaments
  add column if not exists require_payment_receipt boolean not null default false;
alter table tournaments
  add column if not exists registration_fee_text text;

alter table tournament_registrations
  add column if not exists state text;
alter table tournament_registrations
  add column if not exists club_or_school text;

-- Regra de negócio no banco (não só no formulário): se o torneio exige
-- comprovante, a inscrição não pode ser inserida sem ele.
create or replace function enforce_payment_receipt_required()
returns trigger language plpgsql as $$
begin
  if new.payment_receipt_path is null and exists (
    select 1 from tournaments t
    where t.id = new.tournament_id and t.require_payment_receipt = true
  ) then
    raise exception 'PAYMENT_RECEIPT_REQUIRED: este torneio exige comprovante de pagamento na inscrição'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_payment_receipt_required on tournament_registrations;
create trigger trg_payment_receipt_required
  before insert on tournament_registrations
  for each row execute procedure enforce_payment_receipt_required();

-- approve_registration (020) passa a propagar state (UF) pro cadastro global
-- do jogador — club_or_school fica só na inscrição (não é atributo permanente
-- do jogador entre torneios).
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
    insert into players (full_name, birth_year, city, state, federation, fide_id, cbx_id, rating_std)
    values (trim(v_reg.full_name), v_reg.birth_year, v_reg.city, v_reg.state, v_reg.federation,
            v_reg.fide_id, v_reg.cbx_id, v_reg.rating_std)
    returning id into v_player_id;
  end if;

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
