-- Item 2 da análise de arquitetura (docs/analise-arquitetura-2026-11-06.md, "Estrutura de dados").
--
-- 1. Folga coerente em pairings. "Bye" vive em três campos (is_bye, bye_kind,
--    result) e nada impedia combinações sem sentido. Hoje há 0 linhas incoerentes;
--    as travas garantem que continue assim:
--      - is_bye  <=>  result em ('bye', 'not_paired')
--      - bye_kind só existe em folga (importados gravam folga com bye_kind nulo)
--    Conferidos todos os escritores: save_round_draft, approve_registration e
--    lite_publish gravam os três juntos; set_pairing_result recusa folga e o
--    resultado 'bye'; override_pairing_players e return_round_to_draft só mexem em
--    mesas que não são folga; swap_draft_players não toca nesses campos; o robô
--    (import-pairings.ts) grava is_bye e result juntos.
--    De fora, de propósito: "folga não tem jogador de pretas" (hoje vale), porque
--    swap_draft_players troca black_tp_id em qualquer mesa do rascunho.
--
-- 2. tournament_players.direct_encounter e performance_rating nunca foram escritas
--    nem lidas (0 valores não nulos; nenhuma função, view ou código as usa — a
--    performance exibida vem de standings.performance_rating, que fica).

alter table public.pairings drop constraint if exists pairings_bye_result_coherent;
alter table public.pairings add constraint pairings_bye_result_coherent
  check (is_bye = (result in ('bye'::game_result, 'not_paired'::game_result)));

alter table public.pairings drop constraint if exists pairings_bye_kind_only_on_bye;
alter table public.pairings add constraint pairings_bye_kind_only_on_bye
  check (bye_kind is null or is_bye);

alter table public.tournament_players drop column if exists direct_encounter;
alter table public.tournament_players drop column if exists performance_rating;
