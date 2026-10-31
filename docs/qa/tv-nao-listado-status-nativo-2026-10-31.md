# TV não listada e status do torneio nativo

## Diagnóstico

No diagnóstico inicial, o Manual 2 (`copia-manual-2-2-torneio-interno-chess-and-kids-20261031`) tinha status armazenado `ongoing`, 5 rodadas previstas, rodadas 1 e 2 encerradas e rodada 3 em andamento. A consulta `get_tournament_page_data` retornava `effective_status=finished`: sua inferência antiga considerava encerrado qualquer torneio sem resultado pendente, mesmo antes de gerar todas as rodadas ou encerrá-las explicitamente. O organizador pode ter avançado as rodadas desde esse diagnóstico.

## Alterações

- TV abre pelo link com cliente anônimo, tanto para torneios listados quanto não listados. Sem exigência de login/gerente, seguindo a migration 032; rascunhos continuam bloqueados.
- Botão “Painel para TV” também nos torneios não listados, após sair de rascunho. QR e atualizações automáticas mantidos.
- Migration `20261031114547_unlisted_tv_native_status.sql`: `notify_tournament_tv` emite a mesma invalidação vazia para todo torneio publicado; rascunhos e dados pessoais de inscrição continuam protegidos como antes.
- A mesma migration limita a inferência de encerramento de `get_tournament_page_data` a importados. Nativos/app seguem o status efetivamente definido pelo ciclo de vida.
- Nenhum resultado, classificação, rodada ou visibilidade do Manual 2 é alterado.

## Verificação executada em 31/10/2026

- 68 testes focados passaram (4 arquivos): TV, notificações, detalhes de jogadores e detecção de rascunho desatualizado.
- Suíte completa: 498 testes passaram em 55 arquivos.
- `scripts/test-tv-realtime.mjs`: 61 verificações passaram, incluindo idempotência, status nativo/app/importado, eventos de TV não listada, isolamento de rascunhos e payload público vazio. Rollback confirmado das funções, permissões, dados da fixture e mensagens.
- TypeScript passou; lint passou com avisos preexistentes.
- Migration aplicada e registrada via `scripts/apply-sql.mjs`; `scripts/check-migrations.mjs` confirmou 138 arquivos e 138 registros, sem divergências.
- Consulta após a migration confirmou o Manual 2 como `native`, não listado, com `status=ongoing` e `effective_status=ongoing`. Nenhum resultado, rodada ou status foi editado para obter esse resultado.
- As notificações foram testadas com provedores simulados: nenhum push real foi disparado ou reenviado durante a validação.

## Roteiro reproduzível

Após pedido explícito de teste/publicação:

1. Rodar `node --env-file=.env.local scripts/test-tv-realtime.mjs`. Na fixture privada de auditoria, aplica as funções apenas em transação e confirma idempotência, status nativo/app/importado, invalidação dos não listados, payload vazio e proteção de rascunhos. O rollback confirma restauração de ambas as funções, dados e mensagens.
2. Rodar `npx vitest run lib/__tests__/tv-page.test.ts lib/tournament/__tests__/tv-live.test.ts` e lint/tipos.
3. Aplicar a migration via `scripts/apply-sql.mjs` e conferir `scripts/check-migrations.mjs` antes do deploy. Não é necessário regenerar tipos: assinaturas e tipos retornados não mudam.
4. Reconsultar o Manual 2: `tournament.status` e `effective_status` devem concordar, conforme o estado atual real; não usar valor congelado se o organizador tiver avançado o torneio.
5. Abrir o link da TV anônimo em torneio não listado e conferir os resultados publicados e o QR; verificar que torneio/rodada em rascunho não aparece.

## Reversão

Restaurar somente as definições anteriores de `get_tournament_page_data` (071, preservando `search_path=public,pg_temp`) e `notify_tournament_tv` (20261031032527). A UI pode ser revertida separadamente. Não há dados a restaurar: não existe backfill nem alteração de resultados nesta migration.
