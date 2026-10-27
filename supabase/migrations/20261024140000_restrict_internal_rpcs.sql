-- Fecha funções do banco que qualquer visitante (anon) ou usuário logado podia chamar
-- direto por /rest/v1/rpc, sem checagem de permissão (alerta do Supabase
-- anon_security_definer_function_executable, revisão de 2026-10-24).
--
-- 1. Funções internas: só são chamadas por outras funções security definer (que rodam
--    como dono e não dependem destes grants) e pela service role. Nenhum cliente
--    (site, app, worker) chama direto.
--    - _audit: deixava gravar registro falso no histórico de alterações de qualquer torneio;
--    - recalculate_standings: deixava recalcular a classificação de qualquer torneio — num
--      importado, sobrescreve a classificação oficial do chess-results até o próximo ciclo;
--    - _generate_initial_ranking: reordenava o ranking inicial de qualquer grupo;
--    - _recalculate_series_standings: recalculava a classificação de qualquer série.
--
-- 2. get_round_pairings continua público (site, app e assistente usam), mas deixa de
--    devolver rodada em rascunho para quem não gerencia o torneio. Mesma regra do RLS de
--    rounds/pairings; a função é security definer e não passava por ele.
--
-- Idempotente.

revoke execute on function public._audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.recalculate_standings(uuid) from public, anon, authenticated;
revoke execute on function public._generate_initial_ranking(uuid) from public, anon, authenticated;
revoke execute on function public._recalculate_series_standings(uuid) from public, anon, authenticated;

grant execute on function public._audit(uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.recalculate_standings(uuid) to service_role;
grant execute on function public._generate_initial_ranking(uuid) to service_role;
grant execute on function public._recalculate_series_standings(uuid) to service_role;

-- Definição vigente (20261016150000) + filtro de rascunho no fim.
create or replace function public.get_round_pairings(p_round_id uuid)
 returns table(pairing_id uuid, board_number smallint, white_tp_id uuid, white_name text, white_rating smallint, white_rank smallint, white_score numeric, black_tp_id uuid, black_name text, black_rating smallint, black_rank smallint, black_score numeric, result game_result, white_points numeric, black_points numeric, is_bye boolean, manual_override boolean, white_title text, black_title text, white_fide_name text, black_fide_name text, white_federation text, black_federation text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select
    p.id, p.board_number,
    wtp.id, wpl.full_name, wpl.rating_std, wtp.current_rank, wtp.current_score,
    btp.id, coalesce(bpl.full_name, 'BYE'), bpl.rating_std, btp.current_rank, btp.current_score,
    p.result, p.white_points, p.black_points, p.is_bye, p.manual_override,
    wpl.title, bpl.title, wpl.fide_name, bpl.fide_name, wpl.federation, bpl.federation
  from pairings p
  join rounds r on r.id = p.round_id
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
