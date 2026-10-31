# Bye solicitado: meio ponto somente na primeira rodada

Publicação autorizada em 2026-10-30 pelo fluxo `main` → GitHub Actions → Vercel. Não requer migration nem altera o schema ou dados existentes.

## Regra

- `requested_bye_score = 0.5`: ½ ponto apenas na rodada 1; da rodada 2 em diante, zero.
- `requested_bye_score = 0`: zero em todas as rodadas.
- O bye automático de emparceiramento continua valendo 1 ponto. WO, folgas do rodízio, entrada tardia e torneios importados/app não foram alterados.

O helper puro `requestedByeScoreForRound` é compartilhado pelo gerador, pelo serializador TRF e pelo seletor de ausências. No TRF, o código H/Z e o total de pontos usam a mesma regra, para não produzir divergência rejeitada pelo motor.

O formulário explica que ½ ponto só vale na primeira rodada; a seção de ausências mostra os pontos da rodada correspondente. A base de conhecimento foi atualizada no arquivo fonte. A reindexação em produção permanece pendente: `VOYAGE_API_KEY` não está disponível no ambiente local, e não se extraiu nenhuma credencial de produção como alternativa.

## Preservação

Somente gerar ou regerar um rascunho usa a nova política. Pareamentos e byes já registrados não recebem backfill e continuam sendo lidos pelo tipo/pontos armazenados, inclusive meios pontos concedidos antes em rodadas posteriores. Um rascunho antigo precisa ser regerado para aplicar a nova política.

## Verificação

Suíte completa: 370 testes passando em 46 arquivos; TypeScript sem erros e lint sem erros novos. Pareamento validado com o motor WASM real.

- `requested-bye.test.ts`: combinação de configuração e número da rodada.
- `requested-bye-generation.test.ts`: fluxo real de geração com motor WASM e cliente Supabase simulado; confere `bye_kind` e pontos enviados à RPC, o jogador excluído e a preservação do bye automático.
- `serialize.test.ts`: H na primeira rodada habilitada, Z nas demais e pontuação coerente; TRFs aceitos pelo motor real; preservação de bye histórico de ½ ponto na segunda rodada, tanto na geração seguinte quanto na exportação.

Nenhuma gravação ou notificação real é executada por esses testes.
