-- ============================================================
-- Migration 064: corrige "column reference id is ambiguous" em search_tournaments
-- ============================================================
-- Bug latente herdado de 058 (loop de auto-seed) e carregado por 061/063:
-- search_tournaments é RETURNS TABLE com uma coluna de saída chamada `id`, que
-- em plpgsql fica em escopo como variável durante todo o corpo. A linha do loop
-- interno `select id from pairing_groups where tournament_id = v_tid` deixa o
-- `id` ambíguo entre a coluna da tabela e essa variável OUT — com
-- plpgsql.variable_conflict=error (default), a chamada explode com SQLSTATE
-- 42702 assim que o loop de seed roda (ou seja, quando algum torneio nativo
-- vira 'ongoing' por data durante a própria chamada). Não disparava sempre:
-- só quando havia torneio pra semear naquela leitura.
--
-- Correção: qualificar as referências dentro do bloco de seed (pairing_groups
-- pg / rounds r). get_tournament_by_slug tem o mesmo loop mas NÃO é RETURNS
-- TABLE (retorna `tournaments`), então lá `id` não colide — não precisa mexer.
-- Corpo idêntico ao de 063, só qualificando os selects do loop.

drop function if exists search_tournaments(text, text, tournament_status, int, int);

create function search_tournaments(
  p_query  text    default null,
  p_state  text    default null,
  p_status tournament_status default null,
  p_limit  int     default 20,
  p_offset int     default 0
)
returns table (
  id                          uuid,
  slug                        text,
  name                        text,
  city                        text,
  state                       text,
  start_date                  date,
  end_date                    date,
  registration_end_date       date,
  registration_closes_by_date boolean,
  status                      tournament_status,
  tournament_type             tournament_type,
  rounds_count                smallint,
  organizer_name              text,
  time_control                text,
  time_control_kind           time_control_kind,
  player_count                bigint
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
    for v_gid in select pg.id from pairing_groups pg where pg.tournament_id = v_tid loop
      if not exists (select 1 from rounds r where r.pairing_group_id = v_gid and r.status <> 'draft') then
        perform _generate_initial_ranking(v_gid);
      end if;
    end loop;
  end loop;

  return query
  select
    t.id, t.slug, t.name, t.city, t.state,
    t.start_date, t.end_date, t.registration_end_date, t.registration_closes_by_date,
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
