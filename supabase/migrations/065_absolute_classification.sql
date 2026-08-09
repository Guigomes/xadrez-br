-- ============================================================
-- Migration 065: pergunta "haverá classificação absoluta?"
-- ============================================================
-- Pedido do usuário: a seção Classificação (criação e aba Editar) ganha uma
-- quarta pergunta, ao lado de idade/rating/feminina — se o torneio premia o
-- absoluto (ranking que atravessa todas as faixas) ou só as faixas.
--
-- Por que uma coluna e não uma linha em tournament_categories: as classificações
-- são uma PARTIÇÃO (derive_player_category, migration 035, escolhe a mais
-- específica que o jogador satisfaz). Uma categoria com todos os critérios
-- nulos casaria com qualquer um e viraria o balde de sobra da partição — que é
-- exatamente o que o "Geral" já é implicitamente hoje (a célula vazia é
-- descartada de propósito em generateClassificationCells). O absoluto não é uma
-- faixa entre as outras: é transversal, todo jogador do grupo aparece nele.
-- Logo é atributo do torneio, não categoria.
--
-- Default true = comportamento de hoje (o ranking geral sempre existe e é a aba
-- padrão da classificação), então nenhum torneio existente muda de
-- comportamento com esta migration.
--
-- Não precisa mexer em RPC: get_tournament_by_slug devolve `tournaments`
-- inteiro, então a coluna nova chega ao cliente sozinha. search_tournaments tem
-- projeção explícita, mas a lista pública não mostra classificação — fica fora.

alter table tournaments
  add column if not exists has_absolute_classification boolean not null default true;

comment on column tournaments.has_absolute_classification is
  'Se o torneio premia o absoluto (ranking transversal a todas as faixas). false = só as faixas são exibidas/premiadas na classificação. A UI força o absoluto de volta quando o torneio não tem nenhuma faixa, senão não sobraria ranking nenhum.';
