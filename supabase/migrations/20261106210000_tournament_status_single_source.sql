-- Status do torneio com uma regra só (docs/analise-arquitetura-2026-11-06.md, "Status salvo e derivado").
--
-- Antes, quatro lugares decidiam o status:
--   1. a coluna tournaments.status;
--   2. a regra por data (next_status_by_date), aplicada só quando alguém LIA:
--      get_tournament_by_slug e search_tournaments faziam UPDATE como efeito
--      colateral de leitura — torneio que ninguém abria ficava com status velho
--      no banco (alertas, robô e listas liam o velho);
--   3. o "status efetivo" de get_tournament_page_data, que mostrava importado
--      como encerrado sem gravar (a página dizia "Encerrado" e a lista "Em andamento"),
--      e marcava encerrado já ENTRE rodadas, bastando não haver resultado pendente;
--   4. o selo calculado no navegador (isRegistrationClosed), que repetia a regra
--      de data — e já divergiu do banco (bug corrigido na 063).
--
-- Agora:
--   - refresh_tournament_statuses(): ÚNICO lugar que grava a transição por data
--     (e semeia o ranking inicial do nativo que entra em andamento). Roda a cada
--     5 min pelo pg_cron — o banco fica certo mesmo sem visita — e também na
--     abertura da página de UM torneio (get_tournament_by_slug), para o
--     organizador não esperar até 5 min pelo ranking inicial.
--   - tournament_display_status(t): ÚNICO cálculo do status exibido = regra por
--     data + "importado encerrado" (sem pendência E última rodada prevista
--     alcançada ou data final passada — não mais entre rodadas). O encerramento
--     de importado NÃO é gravado de propósito: o robô deixa de sincronizar
--     torneio 'finished', e perderia correções finais da fonte.
--   - search_tournaments deixa de gravar e devolve/filtra pelo status exibido;
--     get_tournament_page_data usa a mesma função; o navegador só traduz o status.

-- ---------------------------------------------------------------------------
-- Status exibido (puro, sem escrita)
-- ---------------------------------------------------------------------------
create or replace function public.tournament_display_status(t public.tournaments)
returns public.tournament_status
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.tournament_status := public.next_status_by_date(
    t.status, t.start_date, t.registration_end_date, t.registration_closes_by_date, t.start_time, t.created_at);
  v_last_round integer;
begin
  if t.mode = 'imported' and v_status = 'ongoing' then
    select max(r.round_number) into v_last_round
      from public.rounds r
     where r.tournament_id = t.id and r.status <> 'draft';
    if v_last_round is not null
       and not exists (select 1 from public.pairings p where p.tournament_id = t.id and p.result = '*')
       and (v_last_round >= t.rounds_count or t.end_date < public.today_brt()) then
      return 'finished';
    end if;
  end if;
  return v_status;
end;
$$;

grant execute on function public.tournament_display_status(public.tournaments) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Transição por data gravada (um torneio ou todos)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_tournament_statuses(p_tournament_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_gid uuid;
  v_count integer := 0;
begin
  for v_row in
    with updated as (
      update public.tournaments t
         set status = public.next_status_by_date(t.status, t.start_date, t.registration_end_date,
                                                 t.registration_closes_by_date, t.start_time, t.created_at)
       where (p_tournament_id is null or t.id = p_tournament_id)
         and public.next_status_by_date(t.status, t.start_date, t.registration_end_date,
                                        t.registration_closes_by_date, t.start_time, t.created_at) <> t.status
      returning t.id, t.status, t.mode
    )
    select * from updated
  loop
    v_count := v_count + 1;
    -- Nativo que entra em andamento ganha o ranking inicial (antes feito na leitura).
    if v_row.status = 'ongoing' and v_row.mode = 'native' then
      for v_gid in select g.id from public.pairing_groups g where g.tournament_id = v_row.id loop
        if not exists (select 1 from public.rounds r where r.pairing_group_id = v_gid and r.status <> 'draft') then
          perform public._generate_initial_ranking(v_gid);
        end if;
      end loop;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.refresh_tournament_statuses(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leitores
-- ---------------------------------------------------------------------------
create or replace function public.get_tournament_by_slug(p_slug text)
returns public.tournaments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status public.tournament_status;
  v_created_by uuid;
begin
  select id, status, created_by into v_id, v_status, v_created_by
    from public.tournaments where slug = p_slug;

  if v_id is null then return null; end if;

  if v_status = 'draft' and v_created_by is distinct from auth.uid() and public.auth_user_role() <> 'admin' then
    return null;
  end if;

  -- Mesmo caminho do agendamento, só para este torneio.
  perform public.refresh_tournament_statuses(v_id);

  return (select t from public.tournaments t where t.id = v_id);
end;
$$;

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
  order by v.start_date desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_tournament_page_data(p_slug text)
returns table(tournament public.tournaments, current_round_number integer, effective_status public.tournament_status,
              last_import_at timestamp with time zone, last_import_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t public.tournaments%rowtype;
  v_round int;
  v_effective_status public.tournament_status;
  v_last_import_at timestamptz;
  v_last_import_status text;
begin
  select * into v_t from public.get_tournament_by_slug(p_slug);
  if v_t.id is null then
    return;
  end if;

  v_effective_status := public.tournament_display_status(v_t);

  select ti.last_run_at, ti.last_status into v_last_import_at, v_last_import_status
    from public.tournament_imports ti
   where ti.tournament_id = v_t.id and ti.last_run_at is not null
   order by ti.last_run_at desc
   limit 1;

  if v_effective_status = 'finished' and v_t.status = 'ongoing' then
    -- Importado encerrado pela fonte: mostra a última rodada.
    select r.round_number into v_round
      from public.rounds r where r.tournament_id = v_t.id
     order by r.round_number desc limit 1;
  elsif v_t.status = 'ongoing' then
    -- Vários grupos: várias rodadas 'ongoing' ao mesmo tempo — a de menor número.
    select r.round_number into v_round
      from public.rounds r
     where r.tournament_id = v_t.id and r.status = 'ongoing'
     order by r.round_number limit 1;
    if v_round is null then
      select r.round_number into v_round
        from public.rounds r where r.tournament_id = v_t.id
       order by r.round_number desc limit 1;
    end if;
  end if;

  return query select v_t, v_round, v_effective_status, v_last_import_at, v_last_import_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agendamento: o banco fica certo mesmo sem ninguém abrir a página.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'refresh-tournament-statuses',
  '*/5 * * * *',
  $cron$select public.refresh_tournament_statuses()$cron$
);
