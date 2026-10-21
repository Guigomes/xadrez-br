-- recalculate_standings: desempates calculados só depois dos pontos de TODOS.
--
-- Bug (definição da 023): o loop gravava current_score de um jogador e, na mesma volta,
-- somava o Buchholz/BH-1/Sonneborn-Berger com o current_score dos adversários — que, para quem
-- o loop ainda não tinha visitado, era o valor do recálculo ANTERIOR. Resultado: desempates
-- um resultado atrasados (numa carga do zero, a 1ª passada lia zeros). Os pontos sempre saíam
-- certos. Achado em 2026-10-21 testando lite_publish (que passou a chamar a função duas vezes
-- como contorno; com esta correção uma chamada basta, e a segunda fica inofensiva).
--
-- Correção: duas etapas. 1) pontos, partidas, V/E/D de todos (current_score + standings);
-- 2) desempates de todos, já com os pontos novos; 3) ordenação, igual à 023.
-- Partindo da última definição (023_configurable_tiebreaks.sql): mesmos campos, mesma
-- whitelist de desempates, mesmo ranking por pairing_group_id.

create or replace function public.recalculate_standings(p_tournament_id uuid)
 returns void
 language plpgsql
 security definer
as $function$
declare
  v_tp record;
  v_points       numeric(5,1);
  v_buchholz     numeric(6,1);
  v_bh_cut1      numeric(6,1);
  v_sb           numeric(8,2);
  v_progressive  numeric(7,1);
  v_games_played smallint;
  v_wins         smallint;
  v_draws        smallint;
  v_losses       smallint;
  v_order        text[];
  v_order_sql    text;
begin
  -- 1. Pontos de todos os ativos.
  for v_tp in
    select tp.id as tp_id
    from tournament_players tp
    where tp.tournament_id = p_tournament_id
      and tp.status = 'active'
  loop
    select
      coalesce(sum(
        case
          when p.white_tp_id = v_tp.tp_id then p.white_points
          when p.black_tp_id = v_tp.tp_id then p.black_points
          else 0
        end
      ), 0),
      count(case when p.result != '*' and p.result != 'bye' then 1 end)::smallint,
      count(case when (p.white_tp_id = v_tp.tp_id and p.result = '1-0')
                   or (p.black_tp_id = v_tp.tp_id and p.result = '0-1') then 1 end)::smallint,
      count(case when p.result = '1/2-1/2' then 1 end)::smallint,
      count(case when (p.white_tp_id = v_tp.tp_id and p.result = '0-1')
                   or (p.black_tp_id = v_tp.tp_id and p.result = '1-0') then 1 end)::smallint
    into v_points, v_games_played, v_wins, v_draws, v_losses
    from pairings p
    where p.tournament_id = p_tournament_id
      and p.result != '*'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id);

    update tournament_players
    set current_score = coalesce(v_points, 0)
    where id = v_tp.tp_id;

    insert into standings (
      tournament_id, tournament_player_id,
      points, games_played, wins, draws, losses, updated_at
    )
    values (
      p_tournament_id, v_tp.tp_id,
      coalesce(v_points, 0), coalesce(v_games_played, 0), coalesce(v_wins, 0),
      coalesce(v_draws, 0), coalesce(v_losses, 0), now()
    )
    on conflict (tournament_id, tournament_player_id)
    do update set
      points       = excluded.points,
      games_played = excluded.games_played,
      wins         = excluded.wins,
      draws        = excluded.draws,
      losses       = excluded.losses,
      updated_at   = now();
  end loop;

  -- 2. Desempates, com o current_score de todos os adversários já atualizado.
  for v_tp in
    select tp.id as tp_id
    from tournament_players tp
    where tp.tournament_id = p_tournament_id
      and tp.status = 'active'
  loop
    select coalesce(sum(opp.current_score), 0)
    into v_buchholz
    from pairings p
    join tournament_players opp
      on opp.id = case
        when p.white_tp_id = v_tp.tp_id then p.black_tp_id
        else p.white_tp_id
      end
    where p.tournament_id = p_tournament_id
      and p.result != '*'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
      and not p.is_bye;

    select coalesce(sum(opp.current_score), 0) - coalesce(min(opp.current_score), 0)
    into v_bh_cut1
    from pairings p
    join tournament_players opp
      on opp.id = case
        when p.white_tp_id = v_tp.tp_id then p.black_tp_id
        else p.white_tp_id
      end
    where p.tournament_id = p_tournament_id
      and p.result != '*'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
      and not p.is_bye;

    select coalesce(sum(
      case
        when (p.white_tp_id = v_tp.tp_id and p.result = '1-0') then opp.current_score
        when (p.black_tp_id = v_tp.tp_id and p.result = '0-1') then opp.current_score
        when p.result = '1/2-1/2' then opp.current_score * 0.5
        else 0
      end
    ), 0)
    into v_sb
    from pairings p
    join tournament_players opp
      on opp.id = case
        when p.white_tp_id = v_tp.tp_id then p.black_tp_id
        else p.white_tp_id
      end
    where p.tournament_id = p_tournament_id
      and p.result != '*'
      and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
      and not p.is_bye;

    -- Progressivo (Cumulative/Sum of Progressive Scores): soma da pontuação
    -- acumulada rodada a rodada, na ordem cronológica.
    select coalesce(sum(cum), 0)
    into v_progressive
    from (
      select sum(
        case
          when p.white_tp_id = v_tp.tp_id then p.white_points
          when p.black_tp_id = v_tp.tp_id then p.black_points
          else 0
        end
      ) over (order by r.round_number rows between unbounded preceding and current row) as cum
      from pairings p
      join rounds r on r.id = p.round_id
      where p.tournament_id = p_tournament_id
        and p.result != '*'
        and (p.white_tp_id = v_tp.tp_id or p.black_tp_id = v_tp.tp_id)
    ) t;

    update tournament_players set progressive = coalesce(v_progressive, 0) where id = v_tp.tp_id;

    update standings
    set buchholz         = v_buchholz,
        buchholz_cut1    = v_bh_cut1,
        sonneborn_berger = v_sb,
        progressive      = coalesce(v_progressive, 0),
        updated_at       = now()
    where tournament_id = p_tournament_id
      and tournament_player_id = v_tp.tp_id;
  end loop;

  -- 3. Ordem de desempate configurável (whitelist — nunca texto livre do usuário).
  select coalesce(t.tiebreak_order, array['buchholz','buchholz_cut1','sonneborn_berger'])
    into v_order
  from tournaments t where t.id = p_tournament_id;

  select string_agg(col, ', ') into v_order_sql
  from (
    select case tb
      when 'buchholz'         then 's.buchholz desc nulls last'
      when 'buchholz_cut1'    then 's.buchholz_cut1 desc nulls last'
      when 'sonneborn_berger' then 's.sonneborn_berger desc nulls last'
      when 'wins'             then 's.wins desc nulls last'
      when 'progressive'      then 's.progressive desc nulls last'
    end as col
    from unnest(coalesce(v_order, '{}')) as tb
  ) x
  where col is not null;

  if v_order_sql is null or v_order_sql = '' then
    v_order_sql := 's.buchholz desc nulls last, s.buchholz_cut1 desc nulls last, s.sonneborn_berger desc nulls last';
  end if;

  execute format(
    $f$with ranked as (
      select
        s.tournament_player_id,
        row_number() over (
          partition by tp.pairing_group_id
          order by s.points desc, %s
        ) as new_rank
      from standings s
      join tournament_players tp on tp.id = s.tournament_player_id
      where s.tournament_id = $1
    )
    update standings s
    set rank = r.new_rank
    from ranked r
    where s.tournament_player_id = r.tournament_player_id
      and s.tournament_id = $1$f$,
    v_order_sql
  ) using p_tournament_id;

  update tournament_players tp
  set current_rank = s.rank,
      buchholz = s.buchholz,
      buchholz_cut1 = s.buchholz_cut1,
      sonneborn_berger = s.sonneborn_berger
  from standings s
  where s.tournament_player_id = tp.id
    and tp.tournament_id = p_tournament_id;
end;
$function$;
