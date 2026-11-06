-- Selective launch: player history only. Preserve global free access to other
-- capabilities, tournament results, player records and the organizer threshold.
insert into public.plans (code,name,description,price_cents,currency,billing_interval,is_public,sort_order)
values ('player','Jogador+','Histórico completo dos jogadores, com adversários e partidas de todos os torneios.',499,'BRL','month',true,1)
on conflict (code) do nothing;

-- The pre-existing hidden player plan had no price. Do not overwrite an
-- operational price if this migration is applied again after a price change.
update public.plans set price_cents=499, currency='BRL', billing_interval='month', is_public=true,
  description='Histórico completo dos jogadores, com adversários e partidas de todos os torneios.'
where code='player' and price_cents is null;

insert into public.plan_entitlements (plan_id,key,enabled,limit_int)
select id,'player.full_history',code in ('player','organizer','plus','pro','federation'),null from public.plans
on conflict (plan_id,key) do nothing;

insert into public.app_settings(key,value) values ('player_history_billing_enabled','true'::jsonb)
on conflict (key) do nothing;

create schema if not exists private;
create or replace function private.can_view_full_player_history()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and (
      coalesce(public.auth_user_role()='admin',false)
      or not coalesce((select value='true'::jsonb from public.app_settings where key='player_history_billing_enabled'),false)
      or exists (
        select 1 from public.subscriptions s
        join public.plan_entitlements e on e.plan_id=s.plan_id and e.key='player.full_history' and e.enabled
        where s.user_id=auth.uid() and s.status='active'
      )
    );
$$;
revoke all on function private.can_view_full_player_history() from public,anon,authenticated;

-- Preserve the public RPC signature/columns and both sources. Only the guard is
-- new. A caller cannot bypass the UI and retrieve the consolidated history.
create or replace function public.get_player_history(p_player_id uuid)
returns table(
  source text, game_id uuid, tournament_id uuid, tournament_slug text,
  tournament_name text, start_date date, time_control_kind time_control_kind,
  homologated boolean, group_name text, round_number smallint, color text,
  opponent_player_id uuid, opponent_name text, opponent_title text,
  opponent_cbx_id text, opponent_rating smallint, result game_result,
  points numeric, has_pgn boolean, my_rating smallint
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'AUTH_REQUIRED: entre na sua conta para ver o histórico completo do jogador' using errcode='42501';
  end if;
  if not private.can_view_full_player_history() then
    raise exception 'PLAYER_HISTORY_SUBSCRIPTION_REQUIRED: assine o Jogador+ para consultar o histórico completo dos jogadores' using errcode='42501';
  end if;

  return query
  select h.* from (
    select
      'live'::text,p.id,t.id,t.slug,t.name,t.start_date,t.time_control_kind,t.homologated,g.name,
      r.round_number,
      case when p.white_tp_id=me.id then 'white' else 'black' end,
      opp.player_id,opl.full_name,opl.title,opl.cbx_id,
      case t.time_control_kind when 'rapid' then opl.rating_rpd when 'blitz' then opl.rating_blz
        when 'bullet' then opl.rating_blz else opl.rating_std end,
      p.result,
      case when p.white_tp_id=me.id then p.white_points else p.black_points end,
      exists(select 1 from pairing_pgns pg where pg.pairing_id=p.id),
      case t.time_control_kind when 'rapid' then mepl.rating_rpd when 'blitz' then mepl.rating_blz
        when 'bullet' then mepl.rating_blz else mepl.rating_std end
    from tournament_players me
    join players mepl on mepl.id=me.player_id
    join tournaments t on t.id=me.tournament_id and t.status<>'draft'
    join pairings p on p.tournament_id=me.tournament_id and (p.white_tp_id=me.id or p.black_tp_id=me.id)
    join rounds r on r.id=p.round_id and r.status<>'draft'
    left join pairing_groups g on g.id=r.pairing_group_id
    left join tournament_players opp on opp.id=case when p.white_tp_id=me.id then p.black_tp_id else p.white_tp_id end
    left join players opl on opl.id=opp.player_id
    where me.player_id=p_player_id

    union all

    select
      'history'::text,hg.id,ht.id,ht.slug,ht.name,ht.start_date,ht.time_control_kind,ht.homologated,hg.group_name,
      hg.round,
      case when hg.white_player_id=p_player_id then 'white' else 'black' end,
      case when hg.white_player_id=p_player_id then hg.black_player_id else hg.white_player_id end,
      coalesce(opl.full_name,case when hg.white_player_id=p_player_id then hg.black_name else hg.white_name end),
      opl.title,opl.cbx_id,
      case when hg.white_player_id=p_player_id then hg.black_rating else hg.white_rating end,
      hg.result,
      case when hg.white_player_id=p_player_id then
        case hg.result when '1-0' then 1 when 'forfeit_black' then 1 when '1/2-1/2' then 0.5 else 0 end
      else
        case hg.result when '0-1' then 1 when 'forfeit_white' then 1 when '1/2-1/2' then 0.5 else 0 end
      end::numeric,
      exists(select 1 from history_game_pgns hp where hp.game_id=hg.id),
      case when hg.white_player_id=p_player_id then hg.white_rating else hg.black_rating end
    from history_games hg
    join history_tournaments ht on ht.id=hg.tournament_id
    left join players opl on opl.id=case when hg.white_player_id=p_player_id then hg.black_player_id else hg.white_player_id end
    where hg.white_player_id=p_player_id or hg.black_player_id=p_player_id
  ) as h(source,game_id,tournament_id,tournament_slug,tournament_name,start_date,time_control_kind,
    homologated,group_name,round_number,color,opponent_player_id,opponent_name,opponent_title,
    opponent_cbx_id,opponent_rating,result,points,has_pgn,my_rating)
  order by h.start_date desc,h.tournament_id,h.round_number;
end $$;
revoke all on function public.get_player_history(uuid) from public,anon;
grant execute on function public.get_player_history(uuid) to authenticated;

-- Rollback: set player_history_billing_enabled=false. Preserves all data and
-- restores consolidated history to registered viewers; it does not cancel billing.
