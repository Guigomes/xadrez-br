-- ============================================================
-- Interruptor global do check-in (desligado, temporário)
-- ============================================================
-- Pedido do dono (2026-10-28): desabilitar o check-in no sistema inteiro por um tempo. Hoje ele
-- é só informativo (o emparceiramento não olha o check-in) e não funciona para quem foi
-- cadastrado à mão sem conta vinculada — o caso da maioria dos torneios escolares.
--
-- Mesmo padrão do billing_enabled (082): uma chave em app_settings, sem mexer na configuração
-- de cada torneio. tournaments.checkin_enabled e as confirmações já feitas ficam intactos;
-- com a chave desligada as telas escondem o check-in e as duas funções recusam.
--
-- RELIGAR:
--   update app_settings set value = 'true' where key = 'checkin_enabled';
--
-- Linha ausente = check-in LIGADO (comportamento de antes desta migration).
--
-- Idempotente. `do nothing`: reaplicar não pode religar/desligar uma chave que alguém já mexeu.

insert into app_settings (key, value) values ('checkin_enabled', 'false')
on conflict (key) do nothing;

create or replace function public.checkin_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select (value #>> '{}')::boolean from public.app_settings where key = 'checkin_enabled'),
    true);
$$;

grant execute on function public.checkin_enabled() to anon, authenticated;

-- Definições vigentes (079, únicas) + a recusa no começo quando a chave está desligada.
create or replace function public.set_my_checkin(p_tournament_player_id uuid)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_t tournaments%rowtype; v_player uuid; v_now timestamptz := now();
begin
  if not public.checkin_enabled() then raise exception 'CHECKIN_DISABLED' using errcode='P0001'; end if;
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select tp.player_id into v_player from tournament_players tp
    where tp.id = p_tournament_player_id;
  select t.* into v_t from tournaments t
    join tournament_players tp on tp.tournament_id = t.id
    where tp.id = p_tournament_player_id;
  if v_player is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if not exists(select 1 from user_player_links where user_id=v_user and player_id=v_player and status='verified') then
    raise exception 'PLAYER_NOT_LINKED' using errcode='42501';
  end if;
  if not v_t.checkin_enabled then raise exception 'CHECKIN_DISABLED' using errcode='P0001'; end if;
  if v_t.checkin_opens_at is not null and v_now < v_t.checkin_opens_at then raise exception 'CHECKIN_NOT_OPEN' using errcode='P0001'; end if;
  if v_t.checkin_closes_at is not null and v_now > v_t.checkin_closes_at then raise exception 'CHECKIN_CLOSED' using errcode='P0001'; end if;
  update tournament_players set checkin_status='checked_in', checked_in_at=v_now where id=p_tournament_player_id;
  return v_now;
end $$;
revoke all on function public.set_my_checkin(uuid) from public, anon;
grant execute on function public.set_my_checkin(uuid) to authenticated;

create or replace function public.set_player_checkin(p_tournament_player_id uuid, p_checked_in boolean)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tournament_id uuid; v_checked_at timestamptz;
begin
  if not public.checkin_enabled() then raise exception 'CHECKIN_DISABLED' using errcode='P0001'; end if;
  select tournament_id into v_tournament_id from tournament_players where id=p_tournament_player_id;
  if v_tournament_id is null then raise exception 'PLAYER_NOT_FOUND' using errcode='P0002'; end if;
  if not is_tournament_manager(v_tournament_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  v_checked_at := case when p_checked_in then now() else null end;
  update tournament_players set
    checkin_status=case when p_checked_in then 'checked_in' else 'pending' end,
    checked_in_at=v_checked_at
  where id=p_tournament_player_id;
  return v_checked_at;
end $$;
revoke all on function public.set_player_checkin(uuid, boolean) from public, anon;
grant execute on function public.set_player_checkin(uuid, boolean) to authenticated;
