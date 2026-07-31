-- ============================================================
-- Chess Viewer - Migration 040: status avança por data, sem cron
-- ============================================================
-- Pedido: inscrições encerram e o torneio inicia sozinhos quando a data
-- chega, mas sem precisar de infraestrutura de cron (não há nenhuma no
-- projeto). Em vez disso, a correção acontece "sob demanda": toda leitura
-- de torneio (individual por slug, ou a listagem pública) primeiro
-- atualiza o status se ele estiver vencido por data, e só então lê/retorna
-- — quem consulta (organizador ou visitante anônimo) sempre vê o status já
-- corrigido. Os botões manuais (edit/page.tsx) continuam existindo para
-- exceção: encerrar/reabrir antes ou depois da data automática.
--
-- Regra (mesma nos dois lugares que a usam, fatorada aqui):
--   published/registration/registration_closed -> ongoing, quando
--     start_date já chegou (prioridade sobre a regra de inscrição: se o
--     torneio já devia ter começado, não faz sentido ele aparecer só como
--     "inscrições encerradas").
--   registration -> registration_closed, quando registration_end_date já
--     passou (e start_date ainda não chegou — senão a regra acima já
--     resolveu).
-- 'draft' nunca avança sozinho — só o organizador decide publicar.
-- 'ongoing'->'finished' continua sendo só por conclusão de rodadas
-- (finish_round, migration 036), não por data.

create or replace function next_status_by_date(
  p_status tournament_status, p_start_date date, p_registration_end_date date
) returns tournament_status language sql stable as $$
  select case
    when p_status in ('published', 'registration', 'registration_closed')
         and p_start_date <= current_date
      then 'ongoing'::tournament_status
    when p_status = 'registration'
         and p_registration_end_date is not null
         and p_registration_end_date < current_date
      then 'registration_closed'::tournament_status
    else p_status
  end;
$$;

-- Busca por slug + corrige status vencido antes de retornar. security
-- definer só para poder gravar a correção — a checagem abaixo replica o
-- gate de visibilidade de "tournaments_select_public" (032) pra não vazar
-- rascunho de outro organizador por link direto.
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
  set status = next_status_by_date(t.status, t.start_date, t.registration_end_date)
  where t.id = v_id
    and next_status_by_date(t.status, t.start_date, t.registration_end_date) <> t.status;

  return (select t from tournaments t where t.id = v_id);
end $$;

-- search_tournaments precisa virar plpgsql para poder gravar a correção em
-- massa antes de filtrar/ordenar (uma função "stable" em SQL puro não devia
-- escrever). A correção roda sobre TODAS as linhas vencidas, não só as que
-- batem com os filtros da busca — qualquer visita à lista pública já serve
-- de "batida de relógio" para o site inteiro.
drop function if exists search_tournaments(text, text, tournament_status, int, int);

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
  set status = next_status_by_date(t.status, t.start_date, t.registration_end_date)
  where next_status_by_date(t.status, t.start_date, t.registration_end_date) <> t.status;

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
