-- Quantas partidas de um torneio têm lances (PGN), para o selo público do torneio.
--
-- O PGN em si só é lido por quem está logado (pairing_pgns). A contagem não revela lance
-- nenhum, então qualquer visitante pode vê-la: ela só avisa que vale entrar para assistir.
-- Idempotente.

create or replace function public.get_tournament_pgn_count(p_tournament_id uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from pairing_pgns pg
  join pairings p on p.id = pg.pairing_id
  join tournaments t on t.id = p.tournament_id
  where p.tournament_id = p_tournament_id
    and t.status <> 'draft';
$$;

revoke all on function public.get_tournament_pgn_count(uuid) from public;
grant execute on function public.get_tournament_pgn_count(uuid) to anon, authenticated;
