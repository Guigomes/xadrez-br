# Notificações por evento da rodada

Publicação autorizada em 2026-10-30 pelo fluxo `main` → GitHub Actions → Vercel. Sem migração adicional e sem envios reais durante os testes.

## Comportamento dos torneios gerenciados no site

- Publicar: depois do sucesso de `publish_round`, envia “Emparceiramento publicado”, rodada e categoria para todos os dispositivos com notificações ativadas naquele torneio, seguindo jogadores ou não.
- Resultado: depois do sucesso de `set_pairing_result`, envia apenas o resultado daquela partida aos dispositivos que acompanham um dos jogadores (inclusive acompanhamento anônimo). Não dispara início nem encerramento. Limpar resultado não envia push.
- Encerrar: depois do sucesso de `finish_round`, envia o aviso de rodada encerrada; o servidor exige `status = finished`, não apenas todas as partidas com resultado.
- Reabrir e voltar para rascunho não disparam esses avisos. Republicar inicia um novo ciclo, identificado por `published_at`, sem apagar o histórico de notificações.
- Repetir a mesma requisição não repete o evento. A falha na gravação da ação não notifica. A entrega não bloqueia o feedback visual do resultado.

## Compatibilidade e segurança

- A rota pública valida sessão e permissão para gerenciar o torneio. A rota interna exige segredo e consulta rodada, partida e estado confirmados no banco; não confia em resultado enviado pelo navegador.
- Publicação e encerramento usam o escopo do torneio, nunca todos os aparelhos do sistema. Resultado de jogador é filtrado por acompanhamento; seguir os dois jogadores não duplica o envio ao dispositivo.
- Mantidas as restrições de torneios privados/rascunhos, os formatos existentes da tabela de eventos e a reconciliação de importações/Lite. A proteção contra reimportação histórica não bloqueia um encerramento explícito atrasado.
- Painéis antigos sem corpo na chamada passam apenas pela verificação de resultados; nunca pelo início ou resumo de rodada.

## Provas automatizadas

Suíte completa: 328 testes passando em 42 arquivos. TypeScript sem erros; lint sem erros, com avisos preexistentes. `git diff --check` passou.

- `round-notification-events.test.ts`: isolamento dos eventos, dados confirmados, partida de outra rodada, rascunhos, torneio privado, deduplicação concorrente, republicação e compatibilidade.
- `round-notification-auth.test.ts`: autenticação, autorização, validação e exatamente uma delegação do evento solicitado.
- `round-notification-recipients.test.ts`: destinatários Web Push e FCM, anônimos/autenticados, seguidores dos dois jogadores e isolamento entre torneios. Provedores simulados.
- `optimistic-round-results.test.ts`: sucesso/falha das ações, chamada somente após confirmação, limpeza/reabertura silenciosas e entrega sem bloquear a interface.
- `tournament-notifications.test.ts`: chaves por publicação e rodada com todos os resultados ainda não encerrada.
