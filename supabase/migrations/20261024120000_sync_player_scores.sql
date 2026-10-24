-- ============================================================
-- Uma só função copia a classificação (standings) para tournament_players
-- ============================================================
-- standings é a FONTE da classificação (nota, posição, desempates, jogos). Em
-- tournament_players ficam cópias denormalizadas (current_score, current_rank,
-- buchholz, buchholz_cut1, sonneborn_berger) porque várias telas leem a nota e a
-- posição direto do inscrito (certificado, imagem de compartilhar, Minha área,
-- perfil, chat) e recalculate_standings usa a nota dos adversários.
--
-- Até aqui a cópia era escrita em dois lugares com lógica própria:
--   - recalculate_standings (um UPDATE em lote no fim, sem a nota);
--   - o robô cron-import, com UM UPDATE POR JOGADOR (centenas de idas ao banco a
--     cada ciclo de um torneio grande).
-- Agora existe sync_player_scores_from_standings(torneio), que faz a cópia inteira
-- num UPDATE só. recalculate_standings passa a chamá-la, e o robô também.
-- Regra: NUNCA escrever esses campos de tournament_players diretamente; escreva em
-- standings e chame esta função (ver CLAUDE.md).
--
-- recalculate_standings muda em DOIS pontos, o resto do corpo é idêntico:
--   1. o UPDATE final vira a chamada da função acima;
--   2. o ranking ganha desempate FINAL determinístico (ranking inicial, depois id).
--      Medido em produção antes desta migration: rodar a função duas vezes seguidas
--      trocava a posição de jogadores com nota e desempates exatamente iguais em 6 de
--      40 torneios — row_number() sem critério final ordena empate de forma arbitrária,
--      então a classificação pública podia "dançar" entre recálculos.
--
-- Idempotente.

create or replace function public.sync_player_scores_from_standings(p_tournament_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with updated as (
    update tournament_players tp
       set current_score    = s.points,
           current_rank     = s.rank,
           buchholz         = s.buchholz,
           buchholz_cut1    = s.buchholz_cut1,
           sonneborn_berger = s.sonneborn_berger
      from standings s
     where s.tournament_player_id = tp.id
       and tp.tournament_id = p_tournament_id
       and s.tournament_id = p_tournament_id
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.sync_player_scores_from_standings(uuid) from public, anon, authenticated;
grant execute on function public.sync_player_scores_from_standings(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.recalculate_standings(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          order by s.points desc, %s, tp.initial_ranking nulls last, tp.id
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

  -- Cópia denormalizada (nota, posição e desempates) vai para tournament_players por UM caminho só.
  perform public.sync_player_scores_from_standings(p_tournament_id);
end;
$function$
;
