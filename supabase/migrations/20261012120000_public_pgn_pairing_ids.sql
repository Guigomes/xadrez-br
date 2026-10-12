-- Quais mesas têm lances (PGN), para o selo "♟ ver lances" aparecer para QUALQUER visitante na
-- lista da rodada. Só devolve o id da mesa, nunca o lance: o PGN continua legível só por quem
-- está logado (RLS de pairing_pgns). Quem não está logado vê o selo e, ao tocar, é convidado a
-- entrar com o Google. Mesmo raciocínio de get_tournament_pgn_count (20261008130000).
-- Idempotente.

create or replace function public.get_pairing_ids_with_pgn(p_pairing_ids uuid[])
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select pg.pairing_id
  from pairing_pgns pg
  join pairings p on p.id = pg.pairing_id
  join tournaments t on t.id = p.tournament_id
  where pg.pairing_id = any(p_pairing_ids)
    and t.status <> 'draft';
$$;

revoke all on function public.get_pairing_ids_with_pgn(uuid[]) from public;
grant execute on function public.get_pairing_ids_with_pgn(uuid[]) to anon, authenticated;
