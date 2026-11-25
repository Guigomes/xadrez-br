-- Lista pública de torneios ordenada por status, não só pela data de início.
--
-- Com "order by start_date desc", torneio em andamento que começou antes ficava abaixo
-- de encerrados mais recentes, e o futuro mais distante vinha antes do próximo.
-- Agora: em andamento > próximos (do mais próximo) > encerrados/cancelados (do mais recente).
-- Mesma assinatura e corpo da 20261106210000, só o ORDER BY muda: create or replace,
-- permissões mantidas. A agenda reordena por conta própria; a home filtra por status.

create or replace function public.search_tournaments(
  p_query text default null::text,
  p_state text default null::text,
  p_status public.tournament_status default null::public.tournament_status,
  p_limit integer default 20,
  p_offset integer default 0)
returns table(id uuid, slug text, name text, city text, state text, start_date date, end_date date,
              registration_end_date date, registration_closes_by_date boolean, status public.tournament_status,
              tournament_type public.tournament_type, rounds_count smallint, organizer_name text,
              time_control text, time_control_kind public.time_control_kind, player_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Só leitura: o status vem de tournament_display_status (mesma regra da página).
  return query
  with visible as (
    select t.*, public.tournament_display_status(t) as display_status
      from public.tournaments t
     where t.is_public = true
       and t.status <> 'draft'
       and (p_query is null or t.name ilike '%' || p_query || '%' or t.city ilike '%' || p_query || '%')
       and (p_state is null or lower(t.state) = lower(p_state))
  )
  select
    v.id, v.slug, v.name, v.city, v.state,
    v.start_date, v.end_date, v.registration_end_date, v.registration_closes_by_date,
    v.display_status, v.tournament_type,
    v.rounds_count, v.organizer_name, v.time_control, v.time_control_kind,
    (select count(*) from public.tournament_players tp where tp.tournament_id = v.id and tp.status = 'active')
  from visible v
  where (p_status is null or v.display_status = p_status)
  -- Em andamento primeiro; depois os que ainda vão começar (publicado, inscrições
  -- abertas ou encerradas), do mais próximo para o mais distante; encerrados e
  -- cancelados por último, do mais recente para o mais antigo.
  order by
    case v.display_status
      when 'ongoing' then 0
      when 'registration' then 1
      when 'registration_closed' then 1
      when 'published' then 1
      else 2
    end,
    case when v.display_status in ('registration', 'registration_closed', 'published') then v.start_date end asc,
    v.start_date desc,
    v.name
  limit p_limit offset p_offset;
end;
$$;
