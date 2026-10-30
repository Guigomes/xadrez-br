# Voltar uma rodada para rascunho

Publicação autorizada em 2026-10-30. As migrations `20261030214042_live_standings_and_draft_pairing_edits.sql` e `20261030220941_return_round_to_draft.sql` foram aplicadas e registradas antes do envio do código. Deploy pelo fluxo `main` → GitHub Actions → Vercel.

- Ação exclusiva da última rodada de cada grupo nativo, publicada ou encerrada. Rodada seguinte gerada, mesmo em rascunho, bloqueia a volta para não apagar/incoerentizar outros pareamentos. Importados e torneios cancelados não são alterados.
- Modal avisa que os jogadores podem ter visto o pareamento e ido às mesas. A rodada some do público até ser publicada novamente; os avisos/push já entregues não são retirados, então o organizador deve comunicar os participantes.
- Resultados existentes não bloqueiam a ação: o modal destaca sua exclusão, recalculando pontos e classificação, e exige um checkbox de confirmação. A RPC exige a confirmação também se um novo resultado chegar enquanto o modal estiver aberto.
- Preserva mesas, inscrições, byes predefinidos e PGNs. Somente resultados inseridos são limpos. Um bye mantido no rascunho não pontua na classificação pública até voltar a ser publicado e recalculado.
- `return_round_to_draft` limpa `published_at`, retorna `draft`, reabre um torneio que estivesse encerrado, recalcula classificação/cópias e grava no audit os resultados retirados. Tudo na mesma transação. Repetir a chamada quando já voltou a rascunho não apaga mais nada nem duplica auditoria.
- RPC permite somente `authenticated`/`service_role`, com verificação de gestor do torneio no corpo e `search_path` fixado. Não usa service role no navegador e não altera permissões de leitura dos dados privados.

## Validação

`node --env-file=.env.local scripts/test-return-round-to-draft.mjs`: 21 verificações, cobrindo confirmação, rodada seguinte, usuário sem permissão, papel autenticado real, retorno com e sem resultados, resultado que chegou com o aviso aberto, classificação das rodadas anteriores, cópias, preservação de mesas/byes/PGN, auditoria e repetição da ação. O teste usa somente o torneio privado de auditoria e faz ROLLBACK; depois confere a restauração das funções, grants, policies, dados, inscrições e PGNs.

`lib/utils/__tests__/return-round-to-draft.test.ts`: disponibilidade do botão, contagem para o aviso (inclui WO/duplo WO; não inclui bye predefinido) e desbloqueio do editor após a volta explícita.

Tipos inicialmente gerados com `scripts/gen-types.mjs --migration` dentro de transação com rollback e regenerados pelo gerador oficial após aplicar as duas migrations. Registro conferido: 135 arquivos e 135 migrations registradas.

## Publicação e rollback

Aplicar as duas migrations antes do deploy da interface e conferir o registro. Não executar nenhuma volta de rodada de usuário automaticamente na publicação. Para rollback do recurso, retirar a interface antes de remover `public.return_round_to_draft(uuid,boolean)`. Voltas já confirmadas são ações do usuário: não restaurar resultados em massa nem automaticamente; a auditoria preserva os valores removidos para eventual revisão autorizada.
