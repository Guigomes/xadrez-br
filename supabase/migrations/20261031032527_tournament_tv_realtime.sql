-- Invalidate the public TV after committed changes, without streaming source rows.
-- Public Broadcast carries only {}: drafts, names and scores never enter the channel.
-- Existing RLS / Postgres Changes publications are deliberately untouched.
create or replace function public.notify_tournament_tv()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tournament_id uuid;
  v_visible boolean := false;
begin
  if tg_table_name = 'tournaments' then
    v_tournament_id := new.id;
    -- Also invalidate a screen that was public before being hidden/unpublished.
    v_visible := (old.is_public and old.status <> 'draft')
              or (new.is_public and new.status <> 'draft');
  else
    if tg_op = 'DELETE' then
      v_tournament_id := old.tournament_id;
    else
      v_tournament_id := new.tournament_id;
    end if;

    select t.is_public and t.status <> 'draft' into v_visible
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
$$;

-- Only the triggers may call this privileged function; not a client-facing RPC.
revoke all on function public.notify_tournament_tv() from public, anon, authenticated;

drop trigger if exists trg_rounds_tv on public.rounds;
create trigger trg_rounds_tv
after insert or delete or update of status, round_number, pairing_group_id on public.rounds
for each row execute function public.notify_tournament_tv();

drop trigger if exists trg_pairings_tv on public.pairings;
create trigger trg_pairings_tv
after insert or delete or update of result, white_points, black_points, board_number,
  white_tp_id, black_tp_id, is_bye, bye_kind on public.pairings
for each row execute function public.notify_tournament_tv();

drop trigger if exists trg_tournaments_tv on public.tournaments;
create trigger trg_tournaments_tv
after update of status, is_public, name, city, state on public.tournaments
for each row execute function public.notify_tournament_tv();
