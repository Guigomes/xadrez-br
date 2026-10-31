# Painel de TV ao vivo

## Escopo

- Atualização de mesas e placares após confirmação no banco, sem reload manual.
- Publicação, resultado/correção/limpeza/WO, encerramento e volta ao rascunho invalidam a TV.
- Reconexão e retorno à tela buscam um snapshot novo; consulta de segurança a cada 20 s.
- Rajadas de eventos são agrupadas em janelas fixas de 500 ms para não gerar uma consulta por mesa.
- Nomes completos, vencedor, empates, WO, bye e não emparceirado identificados no card.
- Última rodada encerrada continua visível entre rodadas; rascunhos/pending nunca entram na seleção.
- Mantém a visão de um grupo/rodada por vez, sem adicionar rotação ou configuração nova.

## Comemoração de vitória

O card mantém o resultado observado antes do refresh e anima somente quando
chega uma nova vitória (incluindo vitória por WO). O troféu salta/gira por 2 s,
o nome entra suavemente e um brilho dourado desaparece em 2,8 s. Não há som,
overlay de tela inteira, scroll, foco automático ou repetição infinita.

Abrir o painel com resultados existentes não comemora partidas antigas; refresh
sem mudança também não. Empate, duplo WO, bye e não emparceirado não comemoram.
Alterar o vencedor cancela a animação anterior e destaca o correto; limpar o
resultado ou desmontar o card cancela os efeitos. Uma mesa com oponentes novos
é tratada como nova referência, não como vitória recém-observada.

Usa Web Animations nativo, sem dependência nova. Com movimento reduzido ou TV
sem essa API, mantém somente o troféu e o destaque estático. Testes:
`lib/tournament/__tests__/tv-victory.test.ts` e `tv-pairing-card.test.ts`.

## Segurança e arquitetura

Migration: `supabase/migrations/20261031032527_tournament_tv_realtime.sql`.

Triggers em `rounds`, `pairings` e `tournaments` chamam uma função de trigger com
`search_path` fixo e execução revogada para clientes. O Broadcast público envia
somente `{}` no tópico `tournament-tv:<uuid>`; a versão instalada do serviço
acrescenta um id da mensagem. Não envia linhas de tabelas, nomes ou resultados.
O cliente ignora o conteúdo e invalida os dados do servidor. A leitura da TV usa
a chave pública, sem cookies/sessão e sem service role, mesmo para organizadores.
Torneio em rascunho ou não público recebe 404.

Não altera grants/RLS das tabelas existentes, não as adiciona à publicação de
Postgres Changes e não modifica objetos do schema gerenciado `realtime`.
Falha no envio não impede salvar resultado/publicar rodada; o polling continua.
O serviço provisiona suas partições diárias ao primeiro assinante de um projeto
ocioso. Isso foi observado ao abrir a assinatura pública; nenhuma partição foi
criada manualmente.

## Verificação

- Suíte completa após adicionar a comemoração: **421 testes em 50 arquivos**, sem falhas; TypeScript sem
  erros; lint dos arquivos alterados sem erros nem avisos.
- Prova SQL: **35 verificações** e confirmação de rollback de schema/dados/journal.
- `lib/tournament/__tests__/tv-live.test.ts`: assinatura, agrupamento, reconexão,
  recuperação, fallback e cleanup de canais/timers.
- `lib/__tests__/tv-pairing-card.test.ts`: nomes, placares, vencedor, empate,
  WO, bye com pontuação real e não emparceirado.
- `lib/__tests__/tv-page.test.ts`: leitor anônimo, isolamento de rascunhos,
  escolha de rodada, último resultado, grupo e tratamento de erro de consulta.
- `node --env-file=.env.local scripts/test-tv-realtime.mjs`: migration
  idempotente e eventos reais no journal em uma transação com rollback;
  verifica também leitura anônima de rascunho negada, ACL e ausência de dados
  pessoais nos avisos. Fixture privada de teste conhecida; nenhum aviso é
  commitado. Hashes de dados, definição/ACL da função e journal são conferidos
  depois do rollback.
- Tipos gerados com `scripts/gen-types.mjs --migration
  20261031032527_tournament_tv_realtime.sql` em transação com rollback:
  sem diferenças, pois função de trigger não é RPC de dados.

## Publicação

Publicação autorizada pelo dono em 2026-10-30 (31/10 UTC). Migration aplicada e
registrada com `scripts/apply-sql.mjs`; conferência de histórico: 136 arquivos e
136 registros, sem divergências. Os três triggers estão ativos e a função não
tem permissão de execução para `anon`/`authenticated`. Suíte: 421 testes;
prova SQL repetida após aplicar, com rollback dos dados de teste.

Publicar via push na `main` e aguardar o GitHub Actions/Vercel confirmar o build.
Validação visual pendente em duas telas com uma rodada de teste: publicação,
resultado, correção e volta ao rascunho. Não alterar partidas reais para obter
essa prova. A publicação não equivale a uma validação visual ponta a ponta.

Rollback da funcionalidade: remover os três triggers `trg_rounds_tv`,
`trg_pairings_tv`, `trg_tournaments_tv` e a função `notify_tournament_tv` em uma
nova migration; voltar o componente para polling. Não apagar resultados ou
rodadas para desfazer a atualização ao vivo.
