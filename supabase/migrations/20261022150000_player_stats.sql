-- ============================================================
-- Perfil premium do jogador (plano de monetização, frente 3/fase 5)
-- ============================================================
-- 1. get_player_history ganha `my_rating`: o rating do próprio jogador naquela
--    partida. No arquivo histórico é o rating da época (history_games guarda os
--    dois lados); nos torneios ao vivo/importados não existe foto do rating por
--    torneio, então vale o rating atual do cadastro no ritmo do torneio (mesma
--    regra que a função já usava para o adversário).
-- 2. Estatísticas avançadas no perfil (por cor, ritmo, força do adversário,
--    desempenho por torneio, sequências): entitlement 'player.stats'.
--    Gratuito não tem; demais planos têm. Com a cobrança desligada (082) todo
--    mundo vê.
-- 3. Plano 'player' ("Jogador+"), a assinatura individual. Nasce SEM preço e
--    fora da vitrine (is_public = false): só entra em /planos quando o dono
--    definir o preço (update plans set price_cents=..., billing_interval='month',
--    is_public=true where code='player').
--
-- Idempotente.

drop function if exists public.get_player_history(uuid);
create function public.get_player_history(p_player_id uuid)
returns table(
  source             text,
  game_id            uuid,
  tournament_id      uuid,
  tournament_slug    text,
  tournament_name    text,
  start_date         date,
  time_control_kind  time_control_kind,
  homologated        boolean,
  group_name         text,
  round_number       smallint,
  color              text,
  opponent_player_id uuid,
  opponent_name      text,
  opponent_title     text,
  opponent_cbx_id    text,
  opponent_rating    smallint,
  result             game_result,
  points             numeric,
  has_pgn            boolean,
  my_rating          smallint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: entre na sua conta para ver o histórico completo do jogador'
      using errcode = '42501';
  end if;

  return query
  select h.* from (
    -- torneios ao vivo e importados (estrutura completa)
    select
      'live'::text, p.id, t.id, t.slug, t.name, t.start_date, t.time_control_kind, t.homologated, g.name,
      r.round_number,
      case when p.white_tp_id = me.id then 'white' else 'black' end,
      opp.player_id, opl.full_name, opl.title, opl.cbx_id,
      case t.time_control_kind
        when 'rapid' then opl.rating_rpd
        when 'blitz' then opl.rating_blz
        when 'bullet' then opl.rating_blz
        else opl.rating_std
      end,
      p.result,
      case when p.white_tp_id = me.id then p.white_points else p.black_points end,
      exists (select 1 from pairing_pgns pg where pg.pairing_id = p.id),
      case t.time_control_kind
        when 'rapid' then mepl.rating_rpd
        when 'blitz' then mepl.rating_blz
        when 'bullet' then mepl.rating_blz
        else mepl.rating_std
      end
    from tournament_players me
    join players mepl on mepl.id = me.player_id
    join tournaments t on t.id = me.tournament_id and t.status <> 'draft'
    join pairings p on p.tournament_id = me.tournament_id
      and (p.white_tp_id = me.id or p.black_tp_id = me.id)
    join rounds r on r.id = p.round_id and r.status <> 'draft'
    left join pairing_groups g on g.id = r.pairing_group_id
    left join tournament_players opp
      on opp.id = case when p.white_tp_id = me.id then p.black_tp_id else p.white_tp_id end
    left join players opl on opl.id = opp.player_id
    where me.player_id = p_player_id

    union all

    -- arquivo histórico (só partidas jogadas)
    select
      'history'::text, hg.id, ht.id, ht.slug, ht.name, ht.start_date, ht.time_control_kind, ht.homologated, hg.group_name,
      hg.round,
      case when hg.white_player_id = p_player_id then 'white' else 'black' end,
      case when hg.white_player_id = p_player_id then hg.black_player_id else hg.white_player_id end,
      coalesce(opl.full_name, case when hg.white_player_id = p_player_id then hg.black_name else hg.white_name end),
      opl.title, opl.cbx_id,
      case when hg.white_player_id = p_player_id then hg.black_rating else hg.white_rating end,
      hg.result,
      case
        when hg.white_player_id = p_player_id then
          case hg.result when '1-0' then 1 when 'forfeit_black' then 1 when '1/2-1/2' then 0.5 else 0 end
        else
          case hg.result when '0-1' then 1 when 'forfeit_white' then 1 when '1/2-1/2' then 0.5 else 0 end
      end::numeric,
      exists (select 1 from history_game_pgns hp where hp.game_id = hg.id),
      case when hg.white_player_id = p_player_id then hg.white_rating else hg.black_rating end
    from history_games hg
    join history_tournaments ht on ht.id = hg.tournament_id
    left join players opl on opl.id = case when hg.white_player_id = p_player_id then hg.black_player_id else hg.white_player_id end
    where hg.white_player_id = p_player_id or hg.black_player_id = p_player_id
  ) as h(source, game_id, tournament_id, tournament_slug, tournament_name, start_date, time_control_kind,
         homologated, group_name, round_number, color, opponent_player_id, opponent_name, opponent_title,
         opponent_cbx_id, opponent_rating, result, points, has_pgn, my_rating)
  order by h.start_date desc, h.tournament_id, h.round_number;
end $$;

revoke all on function public.get_player_history(uuid) from public, anon;
grant execute on function public.get_player_history(uuid) to authenticated;

insert into plans (code, name, description, sort_order, is_public)
values ('player', 'Jogador+', 'Estatísticas avançadas do jogador e alertas sem limite.', 0, false)
on conflict (code) do nothing;

insert into plan_entitlements (plan_id, key, enabled, limit_int)
select p.id, 'player.stats', p.code <> 'free', null from plans p
on conflict (plan_id, key) do nothing;

insert into plan_entitlements (plan_id, key, enabled, limit_int)
select p.id, 'alerts.rules', true, null from plans p where p.code = 'player'
on conflict (plan_id, key) do nothing;

-- Jogador+ não pode perder o que o gratuito já dava (organizar 1 torneio etc.):
-- herda as regras do gratuito; as próprias (acima) já existem e não são tocadas.
insert into plan_entitlements (plan_id, key, enabled, limit_int)
select pl.id, f.key, f.enabled, f.limit_int
  from plan_entitlements f
  join plans fp on fp.id = f.plan_id and fp.code = 'free'
  cross join plans pl
 where pl.code = 'player'
on conflict (plan_id, key) do nothing;
