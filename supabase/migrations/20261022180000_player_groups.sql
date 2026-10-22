-- ============================================================
-- Grupos de jogadores: painel de clube/escola e ferramenta do treinador
-- (plano de monetização, frentes 3.3 e 3.5)
-- ============================================================
-- Uma conta monta um grupo (clube, escola ou alunos de treinador) com jogadores
-- do cadastro e acompanha todos juntos: ranking interno, atividade recente,
-- partidas com lances para revisar e anotações privadas por aluno.
--
-- O grupo só ORGANIZA dados que a conta já pode ver (perfil e histórico são
-- abertos para logado). Nada aqui libera dado novo de jogador. As anotações
-- são privadas do dono do grupo.
--
-- Limite pelo plano: entitlement 'groups.players' (jogadores somados em todos
-- os grupos da conta). Gratuito: 5. Demais: sem teto. Cobrança desligada (082):
-- sem teto.
--
-- Idempotente.

create table if not exists player_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references user_profiles(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  kind       text not null default 'club' check (kind in ('club', 'school', 'coach')),
  created_at timestamptz not null default now()
);

create index if not exists idx_player_groups_owner on player_groups(owner_id);

create table if not exists player_group_members (
  group_id   uuid not null references player_groups(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  note       text check (note is null or length(note) <= 2000),
  added_at   timestamptz not null default now(),
  primary key (group_id, player_id)
);

create index if not exists idx_player_group_members_player on player_group_members(player_id);

alter table player_groups enable row level security;
alter table player_group_members enable row level security;

drop policy if exists player_groups_own on player_groups;
create policy player_groups_own on player_groups for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function is_player_group_owner(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from player_groups where id = p_group_id and owner_id = auth.uid());
$$;

drop policy if exists player_group_members_own on player_group_members;
create policy player_group_members_own on player_group_members for all
  using (public.is_player_group_owner(group_id)) with check (public.is_player_group_owner(group_id));

-- Limite de jogadores (somando os grupos da conta). Serviço e admin passam.
create or replace function enforce_group_players_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_owner uuid;
  v_count integer;
begin
  if auth.uid() is null or public.auth_user_role() = 'admin' then return new; end if;
  v_limit := public.entitlement_limit('groups.players');
  if v_limit is null then return new; end if;
  select owner_id into v_owner from player_groups where id = new.group_id;
  select count(distinct m.player_id) into v_count
    from player_group_members m join player_groups g on g.id = m.group_id
   where g.owner_id = v_owner and m.player_id <> new.player_id;
  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT: seu plano permite acompanhar % jogador(es) nos grupos', v_limit using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_group_players_limit on player_group_members;
create trigger trg_group_players_limit before insert on player_group_members
  for each row execute function enforce_group_players_limit();

insert into plan_entitlements (plan_id, key, enabled, limit_int)
select p.id, 'groups.players', true, case when p.code in ('free', 'player') then 5 else null end
  from plans p
on conflict (plan_id, key) do nothing;

-- Partidas dos membros (ao vivo/importados + arquivo), só jogadas, num período.
-- Base das duas funções abaixo; não é exposta.
create or replace function _group_member_games(p_group_id uuid, p_since date)
returns table (
  player_id uuid, source text, game_id uuid, tournament_id uuid, tournament_slug text, tournament_name text,
  start_date date, round_number smallint, color text, opponent_name text, opponent_rating smallint,
  result game_result, points numeric, has_pgn boolean
)
language sql stable security definer set search_path = public as $$
  select me.player_id, 'live', p.id, t.id, t.slug, t.name, t.start_date, r.round_number,
         case when p.white_tp_id = me.id then 'white' else 'black' end,
         opl.full_name, opl.rating_std, p.result,
         case when p.white_tp_id = me.id then p.white_points else p.black_points end,
         exists (select 1 from pairing_pgns pg where pg.pairing_id = p.id)
    from player_group_members m
    join tournament_players me on me.player_id = m.player_id
    join tournaments t on t.id = me.tournament_id and t.status <> 'draft' and t.start_date >= p_since
    join pairings p on p.tournament_id = me.tournament_id and (p.white_tp_id = me.id or p.black_tp_id = me.id) and not p.is_bye
    join rounds r on r.id = p.round_id and r.status <> 'draft'
    left join tournament_players opp on opp.id = case when p.white_tp_id = me.id then p.black_tp_id else p.white_tp_id end
    left join players opl on opl.id = opp.player_id
   where m.group_id = p_group_id and p.result in ('1-0', '0-1', '1/2-1/2')
  union all
  select m.player_id, 'history', hg.id, ht.id, ht.slug, ht.name, ht.start_date, hg.round,
         case when hg.white_player_id = m.player_id then 'white' else 'black' end,
         case when hg.white_player_id = m.player_id then hg.black_name else hg.white_name end,
         case when hg.white_player_id = m.player_id then hg.black_rating else hg.white_rating end,
         hg.result,
         case
           when hg.result = '1/2-1/2' then 0.5
           when (hg.result = '1-0') = (hg.white_player_id = m.player_id) then 1
           else 0
         end::numeric,
         exists (select 1 from history_game_pgns hp where hp.game_id = hg.id)
    from player_group_members m
    join history_games hg on hg.white_player_id = m.player_id or hg.black_player_id = m.player_id
    join history_tournaments ht on ht.id = hg.tournament_id and ht.start_date >= p_since
   where m.group_id = p_group_id and hg.result in ('1-0', '0-1', '1/2-1/2');
$$;

revoke all on function _group_member_games(uuid, date) from public, anon, authenticated;

-- Painel: um registro por membro com ratings e atividade no período.
create or replace function get_group_overview(p_group_id uuid, p_days integer default 90)
returns table (
  player_id uuid, full_name text, title text, cbx_id text, state text, birth_year smallint,
  rating_std smallint, rating_rpd smallint, rating_blz smallint, note text,
  games integer, points numeric, pgn_games integer,
  last_tournament_name text, last_tournament_date date
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_player_group_owner(p_group_id) then
    raise exception 'FORBIDDEN: grupo de outra conta' using errcode = '42501';
  end if;
  return query
  with g as (select * from public._group_member_games(p_group_id, current_date - greatest(1, least(p_days, 3650)))),
  agg as (
    select g.player_id, count(*)::int n, sum(g.points) pts, count(*) filter (where g.has_pgn)::int pgn
      from g group by g.player_id
  ),
  last_t as (
    select distinct on (g.player_id) g.player_id, g.tournament_name, g.start_date
      from g order by g.player_id, g.start_date desc
  )
  select pl.id, pl.full_name::text, pl.title::text, pl.cbx_id::text, pl.state::text, pl.birth_year::smallint,
         pl.rating_std::smallint, pl.rating_rpd::smallint, pl.rating_blz::smallint, m.note,
         coalesce(agg.n, 0), coalesce(agg.pts, 0), coalesce(agg.pgn, 0),
         last_t.tournament_name, last_t.start_date
    from player_group_members m
    join players pl on pl.id = m.player_id
    left join agg on agg.player_id = m.player_id
    left join last_t on last_t.player_id = m.player_id
   where m.group_id = p_group_id
   order by pl.rating_std desc nulls last, pl.full_name;
end $$;

grant execute on function get_group_overview(uuid, integer) to authenticated;

-- Partidas recentes dos membros, mais novas primeiro (para o treinador revisar).
create or replace function get_group_recent_games(p_group_id uuid, p_days integer default 60, p_only_pgn boolean default false)
returns table (
  player_id uuid, player_name text, source text, game_id uuid, tournament_slug text, tournament_name text,
  start_date date, round_number smallint, color text, opponent_name text, opponent_rating smallint,
  result game_result, points numeric, has_pgn boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_player_group_owner(p_group_id) then
    raise exception 'FORBIDDEN: grupo de outra conta' using errcode = '42501';
  end if;
  return query
  select g.player_id, pl.full_name, g.source, g.game_id, g.tournament_slug, g.tournament_name,
         g.start_date, g.round_number, g.color, g.opponent_name, g.opponent_rating, g.result, g.points, g.has_pgn
    from public._group_member_games(p_group_id, current_date - greatest(1, least(p_days, 3650))) g
    join players pl on pl.id = g.player_id
   where not p_only_pgn or g.has_pgn
   order by g.start_date desc, g.tournament_name, g.round_number desc, pl.full_name
   limit 300;
end $$;

grant execute on function get_group_recent_games(uuid, integer, boolean) to authenticated;
