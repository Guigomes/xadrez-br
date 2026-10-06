-- Suporte ao histórico importado do Minhas Partidas (plano de unificação, fase 1).
--
-- Regras de acesso acordadas:
--   * torneio, classificação, rodadas, partidas e o desempenho do jogador NO
--     torneio continuam públicos (políticas de 032, sem mudança);
--   * o PGN das partidas e o histórico global do jogador (todos os torneios,
--     adversários, confronto direto) exigem usuário logado.
--
-- O RLS protege linhas, não colunas: se o PGN fosse uma coluna de `pairings`,
-- sairia junto com as partidas públicas. Por isso fica numa tabela própria.
--
-- Idempotente: pode ser re-executada sem efeito.

-- 1) Homologação do torneio (CBX). Vazio = não informado.
alter table tournaments
  add column if not exists homologated boolean;

comment on column tournaments.homologated is
  'Torneio homologado pela CBX (vale rating). null = não informado.';

-- 2) PGN das partidas, só para usuários logados.
create table if not exists pairing_pgns (
  pairing_id  uuid primary key references pairings(id) on delete cascade,
  pgn         text not null,
  source      text not null default 'chess-results',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_pairing_pgns_updated_at on pairing_pgns;
create trigger trg_pairing_pgns_updated_at
  before update on pairing_pgns
  for each row execute procedure set_updated_at();

alter table pairing_pgns enable row level security;

-- Leitura: só autenticado, e só do PGN de partida que ele já pode ver (a
-- subconsulta em `pairings` respeita o RLS de pairings, que esconde rascunho).
drop policy if exists "pairing_pgns: logged in can read" on pairing_pgns;
create policy "pairing_pgns: logged in can read"
  on pairing_pgns for select
  to authenticated
  using (exists (select 1 from pairings p where p.id = pairing_pgns.pairing_id));

-- Escrita: nenhuma política. Só a service role (scripts de migração e o
-- cron-import) grava, porque ela ignora o RLS.
revoke all on pairing_pgns from anon;
grant select on pairing_pgns to authenticated;

-- 3) Histórico global do jogador, só para usuários logados.
--    Uma linha por partida jogada pelo jogador, em todos os torneios visíveis.
--    security definer para montar o histórico num passo só; por isso filtra
--    rascunho na mão, como as políticas de 032 fazem.
create or replace function public.get_player_history(p_player_id uuid)
returns table(
  tournament_id      uuid,
  tournament_slug    text,
  tournament_name    text,
  start_date         date,
  time_control_kind  time_control_kind,
  homologated        boolean,
  pairing_group_name text,
  round_number       smallint,
  pairing_id         uuid,
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
  select
    t.id, t.slug, t.name, t.start_date, t.time_control_kind, t.homologated, g.name,
    r.round_number, p.id,
    case when p.white_tp_id = me.id then 'white' else 'black' end,
    opp.player_id, opl.full_name, opl.title, opl.cbx_id,
    -- rating do adversário na modalidade do torneio
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
  order by t.start_date desc, t.id, r.round_number;
end $$;

revoke all on function public.get_player_history(uuid) from public, anon;
grant execute on function public.get_player_history(uuid) to authenticated;

-- Fica para a fase 3 (depois da conciliação dos jogadores): índices únicos em
-- players.cbx_id e players.fide_id. Hoje há pelo menos um CBX duplicado (80242),
-- então criar agora falharia.
