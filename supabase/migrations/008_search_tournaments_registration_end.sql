-- Add registration_end_date to search_tournaments so the UI can show
-- "Inscrições encerradas" when the registration period has passed.

create or replace function search_tournaments(
  p_query  text    default null,
  p_state  text    default null,
  p_status tournament_status default null,
  p_limit  int     default 20,
  p_offset int     default 0
)
returns table (
  id                    uuid,
  slug                  text,
  name                  text,
  city                  text,
  state                 text,
  start_date            date,
  end_date              date,
  status                tournament_status,
  tournament_type       tournament_type,
  rounds_count          smallint,
  organizer_name        text,
  time_control          text,
  player_count          bigint,
  registration_end_date date
) language sql stable security definer as $$
  select
    t.id, t.slug, t.name, t.city, t.state,
    t.start_date, t.end_date, t.status, t.tournament_type,
    t.rounds_count, t.organizer_name, t.time_control,
    count(tp.id),
    t.registration_end_date
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
$$;
