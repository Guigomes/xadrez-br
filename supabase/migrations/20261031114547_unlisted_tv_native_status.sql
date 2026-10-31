-- Unlisted is not access-protected (migration 032). Keep drafts restricted.
-- Native/app status follows explicit lifecycle, not the presence of pending scores.
-- No data backfill, result changes, RLS changes, grants or signature changes.
-- Rollback: restore get_tournament_page_data from 071 (+ fixed search_path)
-- and notify_tournament_tv from 20261031032527. Do not run entire old migrations.

CREATE OR REPLACE FUNCTION public.get_tournament_page_data(p_slug text)
 RETURNS TABLE(tournament tournaments, current_round_number integer, effective_status tournament_status, last_import_at timestamp with time zone, last_import_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_t tournaments%rowtype;
  v_round int;
  v_effective_status tournament_status;
  v_last_import_at timestamptz;
  v_last_import_status text;
  v_has_pending boolean;
begin
  select * into v_t from get_tournament_by_slug(p_slug);
  if v_t.id is null then
    return;
  end if;

  v_effective_status := v_t.status;

  select ti.last_run_at, ti.last_status into v_last_import_at, v_last_import_status
  from tournament_imports ti
  where ti.tournament_id = v_t.id and ti.last_run_at is not null
  order by ti.last_run_at desc
  limit 1;

  if v_t.status = 'ongoing' then
    -- Torneio com múltiplos grupos tem 1 linha de rodada por grupo, então
    -- várias podem estar 'ongoing' ao mesmo tempo — pega a de menor número
    -- (mesmo critério do TS original).
    select r.round_number into v_round
    from rounds r
    where r.tournament_id = v_t.id and r.status = 'ongoing'
    order by r.round_number
    limit 1;

    if v_round is not null then
      -- Native/app completion is explicit. Entering all current results
      -- does not finish a round or a tournament. Only imported tournaments
      -- retain the existing cosmetic reconciliation with their source.
      select exists(
        select 1 from pairings p
        where p.tournament_id = v_t.id and p.result = '*'
      ) into v_has_pending;

      if v_t.mode = 'imported' and not v_has_pending then
        v_effective_status := 'finished';
        select r.round_number into v_round
        from rounds r where r.tournament_id = v_t.id
        order by r.round_number desc
        limit 1;
      end if;
    else
      select r.round_number into v_round
      from rounds r where r.tournament_id = v_t.id
      order by r.round_number desc
      limit 1;
    end if;
  end if;

  return query select v_t, v_round, v_effective_status, v_last_import_at, v_last_import_status;
end $function$;

CREATE OR REPLACE FUNCTION public.notify_tournament_tv()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tournament_id uuid;
  v_visible boolean := false;
begin
  if tg_table_name = 'tournaments' then
    v_tournament_id := new.id;
    -- Published tournaments open by link even when absent from public lists.
    v_visible := (old.status <> 'draft')
              or (new.status <> 'draft');
  else
    if tg_op = 'DELETE' then
      v_tournament_id := old.tournament_id;
    else
      v_tournament_id := new.tournament_id;
    end if;

    select t.status <> 'draft' into v_visible
      from public.tournaments t where t.id = v_tournament_id;
    if not coalesce(v_visible, false) then return null; end if;

    if tg_table_name = 'rounds' then
      -- An ongoing -> draft transition MUST invalidate cached public pairings too.
      v_visible := false;
      if tg_op <> 'INSERT' then
        v_visible := old.status in ('ongoing', 'finished');
      end if;
      if tg_op <> 'DELETE' then
        v_visible := v_visible or new.status in ('ongoing', 'finished');
      end if;
    else
      -- Pairings in drafts / pending rounds produce no public signal at all.
      v_visible := exists (
        select 1 from public.rounds r
         where r.id = case when tg_op = 'DELETE' then old.round_id else new.round_id end
           and r.status in ('ongoing', 'finished')
      );
    end if;
  end if;

  if coalesce(v_visible, false) then
    -- Realtime failure must never reject a valid result or lifecycle transition.
    begin
      perform realtime.send('{}'::jsonb, 'changed', 'tournament-tv:' || v_tournament_id::text, false);
    exception when others then
      raise warning 'TV broadcast unavailable; periodic refresh remains active';
    end;
  end if;
  return null;
end;
$function$;
