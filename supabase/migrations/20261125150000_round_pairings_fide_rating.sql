-- Mesas mostram também o rating FIDE do participante (tournament_players.fide_rating,
-- migration 20261125120000), que o robô grava quando o chess-results publica "EloI".
-- Corpo idêntico à definição vigente (20261031110235) + duas colunas no fim.
-- Mudar o retorno exige drop + create; as permissões são refeitas iguais às de antes
-- (público: site, app e assistente usam; rascunho continua filtrado no corpo).
-- Rollback: rodar de novo a 20261031110235 depois de dropar esta versão.
drop function if exists public.get_round_pairings(uuid);

create function public.get_round_pairings(p_round_id uuid)
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
    else wpl.rating_std end,
    wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'),
    case when t.mode = 'native' then
      case t.rating_kind when 'rpd' then bpl.rating_rpd when 'blz' then bpl.rating_blz else bpl.rating_std end
    else bpl.rating_std end,
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

grant execute on function public.get_round_pairings(uuid) to anon, authenticated, service_role;
