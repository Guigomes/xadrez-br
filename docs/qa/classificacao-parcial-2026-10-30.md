# Classificação parcial e congelamento do pareamento

Publicação autorizada em 2026-10-30. Migration `20261030214042_live_standings_and_draft_pairing_edits.sql` aplicada e registrada antes do envio do código. Deploy pelo fluxo `main` → GitHub Actions → Vercel.

- `set_pairing_result` recalcula pontos, desempates, posição e cópias na mesma transação do resultado, também na rodada em andamento. Correção e limpeza de resultado seguem o mesmo fluxo; autorização e atribuição de árbitros permanecem.
- `override_pairing_players` aceita somente rascunho nativo nunca publicado, com justificativa. Preserva os participantes, sem duplicação, e não troca byes. Trocas entre mesas liberam os assentos dentro da transação para não colidir com índices de unicidade.
- Depois de publicar, o editor desaparece e a RPC recusa alterações, mesmo após reabrir. Uma policy restritiva de UPDATE também bloqueia alteração direta das mesas publicadas por cliente autenticado; leitura e RPC de resultados continuam funcionando. Escrita de importados/app não muda.
- Exceção explícita preparada depois: a última rodada pode voltar para rascunho pela ação confirmada e auditada `return_round_to_draft` (migration `20261030220941`), removendo sua publicação e seus resultados. Não confundir isso com simplesmente reabrir resultados.
- A tela verifica a existência de resultado publicado no grupo, não somente `games_played`: WO e bye não contam como partida no tabuleiro, e um duplo WO pode deixar toda a pontuação em zero. Polling de 30 s e invalidação após resultados são mantidos.
- O indicador da rodada na classificação considera o grupo selecionado. A prévia de resultado ainda não confirmada continua exclusiva do painel; a classificação usa dados confirmados.

## Verificação

`node --env-file=.env.local scripts/test-live-standings.mjs` instala a migration somente em uma transação, testa as RPCs no torneio privado de auditoria e executa ROLLBACK. Verifica pontos e ordem sem encerrar, empate, WO, duplo WO, correção, limpeza, cópias, leitura pela classificação, bloqueio de troca publicada (RPC e RLS), edição de rascunho e autorização. Confere a restauração de funções, ACLs, policies e dados ao final. Não registra migration nem deixa alterações persistentes.

Testes TS: `lib/utils/__tests__/standings-state.test.ts` e `lib/__tests__/standings-result-query.test.ts`.

## Publicação e rollback

Migration aplicada pelo `scripts/apply-sql.mjs`; `scripts/check-migrations.mjs` confirmou 135 arquivos e 135 registros. Tipos regenerados pelo gerador oficial. As assinaturas das duas funções não mudaram. Não há backfill automático: eventual recálculo de um torneio já em andamento deve ser explícito e limitado ao torneio solicitado, nunca em massa em importados/históricos.

Rollback: remover `pairings_update_native_draft_only` e restaurar as duas definições anteriores (030 e 021), mantendo `search_path = public, pg_temp`. Resultados não são apagados. Reverter também a interface para manter cliente/servidor coerentes.
