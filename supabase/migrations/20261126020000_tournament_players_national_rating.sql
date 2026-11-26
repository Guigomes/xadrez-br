-- Rating de cada jogador NA ÉPOCA de cada torneio (pedido do dono, 2026-11-25).
--
-- players.rating_std é um só por jogador e o robô de importação o regravava a cada
-- sincronização: sincronizar torneio antigo depois de um recente punha de volta o rating
-- antigo (Etapas 1–3 do Festival da Criança sobre a Grande Final). Agora o rating que a
-- fonte publica para aquele torneio fica na participação (tournament_players.national_rating),
-- como o FIDE já fica (fide_rating, 20261125120000). Torneio antigo mostra o rating de
-- então, e o histórico do jogador ganha o rating de cada torneio.
--
-- Funções: mesmo retorno e permissões de antes (create or replace, sem drop); só a
-- expressão do rating muda para coalesce(national_rating, rating do cadastro). Nativo
-- segue com o rating do cadastro no ritmo do torneio. Sem national_rating (importações
-- anteriores), nada muda.
-- Partem das últimas definições: standings 20261125170000, mesas 20261125150000,
-- histórico no torneio 20261028190000, histórico do jogador 20261102130414.
-- Rollback: rodar de novo essas quatro definições (a coluna pode ficar).

alter table public.tournament_players add column if not exists national_rating integer;

comment on column public.tournament_players.national_rating is
  'Rating nacional publicado pela fonte do torneio importado (chess-results "EloN") na época deste torneio. Nulo em nativo e em importações anteriores a 2026-11-26.';

create or replace function public.get_tournament_standings(p_tournament_id uuid)
returns table(
  rank smallint, player_id uuid, full_name text, federation text, state text,
  rating_std smallint, initial_ranking smallint, points numeric, games_played smallint,
  wins smallint, draws smallint, losses smallint, buchholz numeric, buchholz_cut1 numeric,
  sonneborn_berger numeric, progressive numeric, performance_rating smallint,
  category_name text, category_id uuid, pairing_group_id uuid, pairing_group_name text,
  tp_id uuid, player_status player_tournament_status, title text, sex text, fide_name text,
  rating_tempo smallint, fide_rating integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  with t as (
    select case when mode = 'native' then rating_kind::text else 'std' end as rating_kind,
      mode = 'native' as is_native,
      mode = 'native'
        and not exists (select 1 from rounds r where r.tournament_id = p_tournament_id and r.status <> 'draft') as pre_start
    from tournaments where id = p_tournament_id
  ), base as (
    select tp.id, tp.pairing_group_id, tp.created_at, pl.full_name,
      case when not t.is_native then coalesce(tp.national_rating, pl.rating_std)
        else case t.rating_kind when 'std' then pl.rating_std when 'rpd' then pl.rating_rpd when 'blz' then pl.rating_blz end end as rk
    from tournament_players tp
    join players pl on pl.id = tp.player_id
    cross join t
    where tp.tournament_id = p_tournament_id and tp.status = 'active'
  ), prev as (
    select id, row_number() over (
      partition by pairing_group_id
      order by rk desc nulls last, case when rk is null then created_at end asc, full_name asc, id
    )::smallint as rn
    from base
  )
  select
    coalesce(s.rank, tp.initial_ranking, case when t.pre_start then prev.rn end),
    pl.id, pl.full_name, pl.federation, pl.state,
    (case when t.is_native then pl.rating_std else coalesce(tp.national_rating, pl.rating_std) end)::smallint,
    tp.initial_ranking, coalesce(s.points, 0), coalesce(s.games_played, 0),
    coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0),
    s.buchholz, s.buchholz_cut1, s.sonneborn_berger, s.progressive, s.performance_rating,
    cat.name, cat.id, pg.id, pg.name, tp.id, tp.status, pl.title, pl.sex::text, pl.fide_name,
    (case when not t.is_native then coalesce(tp.national_rating, pl.rating_std)
      else case t.rating_kind when 'std' then pl.rating_std when 'rpd' then pl.rating_rpd when 'blz' then pl.rating_blz end end)::smallint,
    tp.fide_rating
  from tournament_players tp
  join players pl on pl.id = tp.player_id
  cross join t
  left join prev on prev.id = tp.id
  left join standings s on s.tournament_player_id = tp.id and s.tournament_id = p_tournament_id
  left join tournament_categories cat on cat.id = tp.category_id
  left join pairing_groups pg on pg.id = tp.pairing_group_id
  where tp.tournament_id = p_tournament_id
  order by pg.sort_order nulls last,
    coalesce(s.rank, tp.initial_ranking, case when t.pre_start then prev.rn end) asc nulls last,
    coalesce(s.points, 0) desc,
    tp.created_at, tp.id;
$$;

create or replace function public.get_round_pairings(p_round_id uuid)
returns table(
  pairing_id uuid, board_number smallint,
  white_tp_id uuid, white_name text, white_rating smallint, white_rank smallint, white_score numeric,
  black_tp_id uuid, black_name text, black_rating smallint, black_rank smallint, black_score numeric,
  result game_result, white_points numeric, black_points numeric, is_bye boolean, manual_override boolean,
  white_title text, black_title text, white_fide_name text, black_fide_name text,
  white_federation text, black_federation text,
  white_fide_rating integer, black_fide_rating integer
)
language sql stable security definer
set search_path = public, pg_temp
as $function$
  select
    p.id, p.board_number,
    wtp.id, wpl.full_name,
    case when t.mode = 'native' then
      case t.rating_kind when 'rpd' then wpl.rating_rpd when 'blz' then wpl.rating_blz else wpl.rating_std end
    else coalesce(wtp.national_rating, wpl.rating_std)::smallint end,
    wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'),
    case when t.mode = 'native' then
      case t.rating_kind when 'rpd' then bpl.rating_rpd when 'blz' then bpl.rating_blz else bpl.rating_std end
    else coalesce(btp.national_rating, bpl.rating_std)::smallint end,
    btp.current_rank, btp.current_score,
    p.result, p.white_points, p.black_points, p.is_bye, p.manual_override,
    wpl.title, bpl.title, wpl.fide_name, bpl.fide_name, wpl.federation, bpl.federation,
    wtp.fide_rating, btp.fide_rating
  from pairings p
  join rounds r on r.id = p.round_id
  join tournaments t on t.id = r.tournament_id
  join tournament_players wtp on wtp.id = p.white_tp_id
  join players wpl on wpl.id = wtp.player_id
  left join tournament_players btp on btp.id = p.black_tp_id
  left join players bpl on bpl.id = btp.player_id
  where p.round_id = p_round_id
    and (
      r.status <> 'draft'
      or auth.role() = 'service_role'
      or public.is_tournament_manager(r.tournament_id)
      or public.auth_user_role() = 'admin'
    )
  order by p.board_number asc nulls last;
$function$;

create or replace function public.get_player_tournament_history(p_tournament_id uuid, p_tp_id uuid)
returns table(
  round_number smallint, round_status round_status, board_number smallint, color text,
  opponent_name text, opponent_rating smallint, opponent_rank smallint, opponent_points numeric,
  result game_result, points_earned numeric, is_bye boolean, cumulative_pts numeric,
  opponent_title text, opponent_tp_id uuid, opponent_fide_name text, opponent_federation text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    r.round_number, r.status, p.board_number,
    case when p.white_tp_id = p_tp_id then 'white' else 'black' end,
    coalesce(opp_pl.full_name, 'BYE'),
    case when t.mode = 'native' then
      case t.rating_kind when 'rpd' then opp_pl.rating_rpd when 'blz' then opp_pl.rating_blz else opp_pl.rating_std end
    else coalesce(opp_tp.national_rating, opp_pl.rating_std)::smallint end,
    opp_tp.current_rank, opp_s.points,
    p.result,
    case when p.white_tp_id = p_tp_id then p.white_points else p.black_points end,
    p.is_bye,
    sum(
      case when p2.white_tp_id = p_tp_id then p2.white_points else p2.black_points end
    ) over (order by r.round_number rows between unbounded preceding and current row),
    opp_pl.title,
    opp_tp.id,
    opp_pl.fide_name,
    opp_pl.federation
  from pairings p
  join rounds r on r.id = p.round_id
  join tournaments t on t.id = p_tournament_id
  left join tournament_players opp_tp
    on opp_tp.id = case when p.white_tp_id = p_tp_id then p.black_tp_id else p.white_tp_id end
  left join players opp_pl on opp_pl.id = opp_tp.player_id
  left join standings opp_s on opp_s.tournament_player_id = opp_tp.id
  join pairings p2 on p2.round_id = p.round_id
    and (p2.white_tp_id = p_tp_id or p2.black_tp_id = p_tp_id)
  where p.tournament_id = p_tournament_id
    and (p.white_tp_id = p_tp_id or p.black_tp_id = p_tp_id)
  order by r.round_number;
$$;

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
      coalesce(opp.national_rating::smallint, case t.time_control_kind when 'rapid' then opl.rating_rpd when 'blitz' then opl.rating_blz
        when 'bullet' then opl.rating_blz else opl.rating_std end),
      p.result,
      case when p.white_tp_id=me.id then p.white_points else p.black_points end,
      exists(select 1 from pairing_pgns pg where pg.pairing_id=p.id),
      coalesce(me.national_rating::smallint, case t.time_control_kind when 'rapid' then mepl.rating_rpd when 'blitz' then mepl.rating_blz
        when 'bullet' then mepl.rating_blz else mepl.rating_std end)
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
