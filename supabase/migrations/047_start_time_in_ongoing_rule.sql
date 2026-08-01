-- ============================================================
-- Migration 047: horário de início entra na regra automática de 'ongoing'
-- ============================================================
-- 044 deixou start_time puramente informativo — a regra automática
-- (next_status_by_date, 040/043/045) só olhava start_date, então um
-- torneio com start_time=20:00 virava 'ongoing' de manhã, quando o dia
-- batia, não quando a partida de fato começa.
--
-- now_brt(): today_brt() (043) só devolve a data; aqui precisa da hora
-- também pra comparar contra start_date + start_time.
--
-- Sem start_time preenchido, coalesce cai em 00:00 — mesmo resultado de
-- comparar só a data (comportamento antigo preservado pra quem não usa
-- o campo).

create or replace function now_brt() returns timestamp
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo');
$$;

drop function if exists next_status_by_date(tournament_status, date, date, boolean);

create or replace function next_status_by_date(
  p_status tournament_status, p_start_date date, p_registration_end_date date,
  p_registration_closes_by_date boolean, p_start_time time
) returns tournament_status language sql stable as $$
  select case
    when p_status in ('published', 'registration', 'registration_closed')
         and (p_start_date + coalesce(p_start_time, time '00:00')) <= now_brt()
      then 'ongoing'::tournament_status
    when p_status = 'registration'
         and p_registration_closes_by_date
         and p_registration_end_date is not null
         and p_registration_end_date < today_brt()
      then 'registration_closed'::tournament_status
    else p_status
  end;
$$;

create or replace function get_tournament_by_slug(p_slug text)
returns tournaments language plpgsql security definer as $$
declare
  v_id uuid;
  v_status tournament_status;
  v_created_by uuid;
begin
  select id, status, created_by into v_id, v_status, v_created_by
  from tournaments where slug = p_slug;

  if v_id is null then return null; end if;

  if v_status = 'draft' and v_created_by is distinct from auth.uid() and auth_user_role() <> 'admin' then
    return null;
  end if;

  update tournaments t
  set status = next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time)
  where t.id = v_id
    and next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time) <> t.status;

  return (select t from tournaments t where t.id = v_id);
end $$;

create or replace function search_tournaments(
  p_query  text    default null,
  p_state  text    default null,
  p_status tournament_status default null,
  p_limit  int     default 20,
  p_offset int     default 0
)
returns table (
  id                      uuid,
  slug                    text,
  name                    text,
  city                    text,
  state                   text,
  start_date              date,
  end_date                date,
  registration_end_date   date,
  status                  tournament_status,
  tournament_type         tournament_type,
  rounds_count            smallint,
  organizer_name          text,
  time_control            text,
  player_count            bigint
) language plpgsql security definer as $$
begin
  update tournaments t
  set status = next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time)
  where next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time) <> t.status;

  return query
  select
    t.id, t.slug, t.name, t.city, t.state,
    t.start_date, t.end_date, t.registration_end_date,
    t.status, t.tournament_type,
    t.rounds_count, t.organizer_name, t.time_control,
    count(tp.id)
  from tournaments t
  left join tournament_players tp on tp.tournament_id = t.id and tp.status = 'active'
  where t.is_public = true
    and t.status != 'draft'
    and (p_query  is null or t.name ilike '%' || p_query || '%' or t.city ilike '%' || p_query || '%')
    and (p_state  is null or lower(t.state) = lower(p_state))
    and (p_status is null or t.status = p_status)
  group by t.id
  order by t.start_date desc
  limit p_limit offset p_offset;
end;
$$;

-- Reparo: torneios empurrados pra 'ongoing' só porque o dia bateu, mas cujo
-- start_time (agora considerado) ainda não chegou e nenhuma rodada existe —
-- mesma lógica de segurança do reparo em 043 (rodada existente = realmente
-- em andamento, não mexe).
update tournaments t
set status = 'published'
where t.status = 'ongoing'
  and t.start_time is not null
  and (t.start_date + t.start_time) > now_brt()
  and not exists (select 1 from rounds r where r.tournament_id = t.id);
