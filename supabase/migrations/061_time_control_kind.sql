-- 061_time_control_kind.sql
-- Categoria do ritmo de jogo, pra busca/estatística e pra sugerir o rating de
-- seed na criação. O texto exibido continua em tournaments.time_control; esta
-- coluna é só a classificação (bullet/blitz/rapid/classical/other).
-- Idempotente.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'time_control_kind') then
    create type time_control_kind as enum ('bullet', 'blitz', 'rapid', 'classical', 'other');
  end if;
end $$;

alter table tournaments
  add column if not exists time_control_kind time_control_kind not null default 'other';

-- Backfill dos torneios existentes pela heurística de minutos-base (primeiro
-- número do texto do ritmo): <3 bullet, <10 blitz, <60 rápido, senão clássico.
-- Só mexe em quem ainda está no default 'other', pra ser reexecutável sem
-- sobrescrever ajuste manual futuro.
update tournaments
set time_control_kind = case
    when base_min is null then 'other'
    when base_min < 3  then 'bullet'
    when base_min < 10 then 'blitz'
    when base_min < 60 then 'rapid'
    else 'classical'
  end::time_control_kind
from (
  select id, nullif(substring(time_control from '(\d+)'), '')::int as base_min
  from tournaments
) as parsed
where tournaments.id = parsed.id
  and tournaments.time_control_kind = 'other';

-- ------------------------------------------------------------
-- search_tournaments: expõe a nova coluna. Mudar o tipo de retorno exige drop
-- antes do recreate (create or replace não altera assinatura de retorno).
-- Corpo idêntico ao de 058, só somando t.time_control_kind.
-- ------------------------------------------------------------
drop function if exists search_tournaments(text, text, tournament_status, int, int);

create function search_tournaments(
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
  time_control_kind       time_control_kind,
  player_count            bigint
) language plpgsql security definer as $$
declare
  v_tid uuid;
  v_gid uuid;
begin
  for v_tid in
    with updated as (
      update tournaments t
      set status = next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at)
      where next_status_by_date(t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at) <> t.status
      returning t.id, t.status, t.mode
    )
    select u.id from updated u where u.status = 'ongoing' and u.mode = 'native'
  loop
    for v_gid in select id from pairing_groups where tournament_id = v_tid loop
      if not exists (select 1 from rounds r where r.pairing_group_id = v_gid and r.status <> 'draft') then
        perform _generate_initial_ranking(v_gid);
      end if;
    end loop;
  end loop;

  return query
  select
    t.id, t.slug, t.name, t.city, t.state,
    t.start_date, t.end_date, t.registration_end_date,
    t.status, t.tournament_type,
    t.rounds_count, t.organizer_name, t.time_control, t.time_control_kind,
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
