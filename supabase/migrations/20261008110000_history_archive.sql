-- Arquivo histórico de torneios (plano de unificação, fase 4 revisada).
--
-- Torneios antigos que vêm do Minhas Partidas não precisam da estrutura de torneio ao
-- vivo (inscrição, emparceiramento, rodada, bye, classificação oficial). Guardamos só o
-- que serve à história: o torneio, as partidas jogadas e quem jogou.
--
-- Regras de acesso (decididas com o dono do projeto):
--   * torneio, partidas e desempenho do jogador no torneio: públicos;
--   * PGN (lances) e histórico completo do jogador: só usuário logado.
--
-- O histórico completo do jogador passa a juntar duas fontes: torneios ao vivo/importados
-- (pairings) e este arquivo. Nada é copiado de uma fonte para a outra.
--
-- Idempotente.

-- 1) Torneio arquivado
create table if not exists history_tournaments (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  start_date        date not null,
  -- a data vem da base antiga; false = confirmada na fonte (chess-results)
  date_approx       boolean not null default true,
  end_date          date,
  time_control_kind time_control_kind not null default 'other',
  homologated       boolean,
  city              text,   -- null = não informado
  state             text,   -- null = não informado
  organizer_name    text,   -- null = não informado
  groups            text[] not null default '{}',
  source_tnrs       text[] not null default '{}',
  source_url        text,
  players_count     integer not null default 0,
  games_count       integer not null default 0,
  pgn_count         integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_history_tournaments_date on history_tournaments (start_date desc);

-- 2) Partidas jogadas (sem bye, sem "não emparceirado")
create table if not exists history_games (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references history_tournaments(id) on delete cascade,
  -- chave da base antiga (tnr-rRODADA-nº brancas-nº pretas): torna a carga repetível
  source_game_id   text not null unique,
  group_name       text,
  round            smallint not null,
  white_player_id  uuid references players(id),
  black_player_id  uuid references players(id),
  -- nomes e ratings como estavam no torneio
  white_name       text not null,
  black_name       text not null,
  white_rating     smallint,
  black_rating     smallint,
  result           game_result not null
    check (result in ('1-0', '0-1', '1/2-1/2', 'forfeit_white', 'forfeit_black', 'double_forfeit')),
  created_at       timestamptz not null default now()
);
create index if not exists idx_history_games_white on history_games (white_player_id);
create index if not exists idx_history_games_black on history_games (black_player_id);
create index if not exists idx_history_games_tournament on history_games (tournament_id, round);

-- 3) PGN: tabela própria, só para logados (RLS protege linhas, não colunas)
create table if not exists history_game_pgns (
  game_id    uuid primary key references history_games(id) on delete cascade,
  pgn        text not null,
  source     text not null default 'chess-results',
  created_at timestamptz not null default now()
);

alter table history_tournaments enable row level security;
alter table history_games       enable row level security;
alter table history_game_pgns   enable row level security;

drop policy if exists "history_tournaments: public read" on history_tournaments;
create policy "history_tournaments: public read" on history_tournaments for select to anon, authenticated using (true);
drop policy if exists "history_games: public read" on history_games;
create policy "history_games: public read" on history_games for select to anon, authenticated using (true);
drop policy if exists "history_game_pgns: logged in can read" on history_game_pgns;
create policy "history_game_pgns: logged in can read" on history_game_pgns for select to authenticated using (true);

-- Escrita: nenhuma política. Só a service role (scripts de carga) grava.
revoke all on history_tournaments, history_games, history_game_pgns from anon, authenticated;
grant select on history_tournaments, history_games to anon, authenticated;
grant select on history_game_pgns to authenticated;

-- 4) Desempenho dos jogadores no torneio arquivado (público)
--    Pontos somados SÓ das partidas jogadas: quem teve bye aparece com menos pontos que o
--    oficial. A tela deve rotular como "pontos nas partidas jogadas".
create or replace function public.get_history_tournament_players(p_tournament_id uuid)
returns table(
  player_id uuid, player_name text, group_name text,
  games integer, wins integer, draws integer, losses integer, points numeric
)
language sql stable
set search_path = public
as $$
  with sides as (
    select g.white_player_id as player_id, g.white_name as name, g.group_name,
           case g.result when '1-0' then 1 when 'forfeit_black' then 1 when '1/2-1/2' then 0.5 else 0 end as pts,
           case when g.result in ('1-0', 'forfeit_black') then 1 else 0 end as win,
           case when g.result = '1/2-1/2' then 1 else 0 end as draw,
           case when g.result in ('0-1', 'forfeit_white', 'double_forfeit') then 1 else 0 end as loss
    from history_games g where g.tournament_id = p_tournament_id
    union all
    select g.black_player_id, g.black_name, g.group_name,
           case g.result when '0-1' then 1 when 'forfeit_white' then 1 when '1/2-1/2' then 0.5 else 0 end,
           case when g.result in ('0-1', 'forfeit_white') then 1 else 0 end,
           case when g.result = '1/2-1/2' then 1 else 0 end,
           case when g.result in ('1-0', 'forfeit_black', 'double_forfeit') then 1 else 0 end
    from history_games g where g.tournament_id = p_tournament_id
  )
  select s.player_id, coalesce(p.full_name, max(s.name)), s.group_name,
         count(*)::int, sum(win)::int, sum(draw)::int, sum(loss)::int, sum(pts)::numeric
  from sides s
  left join players p on p.id = s.player_id
  group by s.player_id, p.full_name, s.group_name, case when s.player_id is null then s.name end
  order by sum(pts) desc, count(*) desc;
$$;
grant execute on function public.get_history_tournament_players(uuid) to anon, authenticated;

-- 5) Histórico completo do jogador: junta torneios ao vivo/importados e o arquivo.
--    Só para logado. Substitui a versão da migration 20261007120000 (mesmas colunas, mais
--    `source` e `game_id`; pairing_id vira game_id).
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
  has_pgn            boolean
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
      exists (select 1 from pairing_pgns pg where pg.pairing_id = p.id)
    from tournament_players me
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
      exists (select 1 from history_game_pgns hp where hp.game_id = hg.id)
    from history_games hg
    join history_tournaments ht on ht.id = hg.tournament_id
    left join players opl on opl.id = case when hg.white_player_id = p_player_id then hg.black_player_id else hg.white_player_id end
    where hg.white_player_id = p_player_id or hg.black_player_id = p_player_id
  ) as h(source, game_id, tournament_id, tournament_slug, tournament_name, start_date, time_control_kind,
         homologated, group_name, round_number, color, opponent_player_id, opponent_name, opponent_title,
         opponent_cbx_id, opponent_rating, result, points, has_pgn)
  order by h.start_date desc, h.tournament_id, h.round_number;
end $$;

revoke all on function public.get_player_history(uuid) from public, anon;
grant execute on function public.get_player_history(uuid) to authenticated;

comment on table history_tournaments is 'Arquivo histórico: torneio antigo, só com as partidas jogadas (sem estrutura de torneio ao vivo).';
comment on table history_games is 'Partidas jogadas de torneios arquivados. Resultado público; PGN em history_game_pgns (só logado).';
