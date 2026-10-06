-- Identidade única de jogador por CBX e por FIDE (plano de unificação, fase 3).
--
-- Depois da conciliação com a base do Minhas Partidas não há mais CBX nem FIDE
-- repetidos fora dos jogadores de teste. Os índices impedem que a importação
-- (cron-import, inscrição) volte a criar o mesmo jogador duas vezes: quem cria
-- jogador precisa procurar pelo CBX primeiro, depois pelo FIDE.
--
-- Parciais: vazio não conta, e jogadores de teste (is_test) ficam de fora.
-- Idempotente.

create unique index if not exists players_cbx_id_unique
  on players (cbx_id)
  where cbx_id is not null and cbx_id <> '' and not coalesce(is_test, false);

create unique index if not exists players_fide_id_unique
  on players (fide_id)
  where fide_id is not null and fide_id <> '' and not coalesce(is_test, false);
