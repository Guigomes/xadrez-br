# Rating das mesas e PGN após encerrar a rodada

## Alterações locais

- Causa do rating incorreto: `get_round_pairings` selecionava sempre `players.rating_std`.
- Migration `20261031110235_round_pairings_tournament_rating.sql`: no nativo, escolhe a coluna pelo `rating_kind` configurado; importados/app continuam usando `rating_std`, onde guardam o rating da fonte.
- Não há fallback entre ritmos: um rating rápido ausente não deve virar um clássico.
- Mesma assinatura e permissões da função anterior; títulos, nomes, federações, pontos, ordem das mesas e proteção de rascunhos preservados. Tipos gerados não precisam mudar: nenhuma coluna, argumento ou tipo retornado mudou.
- Botão de anexar/alterar PGN fica apenas nas rodadas nativas encerradas, sem botão nos byes. API e arquivos já anexados não são alterados.

## Procedimento de verificação

Quando houver pedido de testar/publicar:

1. Rodar `node --env-file=.env.local scripts/test-round-pairings-rating.mjs`. Usa apenas o torneio privado de auditoria e desfaz tanto a função quanto os dados no final. Verifica os três ritmos nos dois lados, ausência de rating sem fallback, importados/app, idempotência, assinatura/grants e isolamento de rascunhos anônimos.
2. Rodar `npx vitest run lib/__tests__/round-player-details.test.ts` e lint dos arquivos afetados.
3. Aplicar a migration com `scripts/apply-sql.mjs` e conferir `scripts/check-migrations.mjs`, somente com autorização para testar/publicar.
4. No navegador, conferir os ratings de brancas/pretas em torneio rápido e a ausência do botão de PGN durante a rodada; após encerrar, selecionar a rodada pelo histórico e conferir o botão. A preparação da próxima rodada continua sendo o destino padrão.

## Verificação para publicação (2026-10-31)

- Script SQL: 9 verificações passaram, com confirmação adicional de rollback da função/permissões e de todos os dados da fixture.
- Migration aplicada e registrada antes do deploy. Registro conferido: 137 arquivos / 137 versões registradas, sem divergências.
- Consulta pós-migration: 72 mesas recentes verificadas (48 clássicas e 24 rápidas), nenhuma divergência de rating nos dois lados.
- Testes focados `result-card-layout`, `round-player-details` e `standings-category-label`: 40 testes aprovados, cobrindo também a moldura verde e a supressão da categoria redundante.
- `npm run type-check` e `npm run lint`: aprovados; lint mantém avisos preexistentes.
- Advisors de segurança consultados. A função mantém os grants públicos intencionais para leitura das rodadas publicadas e o filtro de rascunhos; não houve mudança de permissões. Demais avisos preexistentes não foram alterados por esta entrega.
- Não foi realizada conferência visual no navegador/celular nesta rodada. Os testes da interface renderizam os componentes; não substituem uma validação visual.
- Publicação pelo pipeline do `main`, com testes completos e deploy monitorados antes de comunicar conclusão.

## Reversão

Restaurar somente a definição de `get_round_pairings` em `20261024140000_restrict_internal_rpcs.sql` (não executar o arquivo todo, que contém outros ajustes de permissões). A UI pode ser revertida separadamente. Não há migração de dados, recálculo de classificação ou alteração de resultados a desfazer.
