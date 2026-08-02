# Chatbot de Suporte — Status e Pendências

> Complementa `docs/plano-chatbot-suporte.md`. Registrado em 2026-08-01,
> atualizado em 2026-08-02.
> Escopo: **Fases 1, 2 e 3** do plano original (KB + busca semântica + widget
> de chat + escalonamento humano). Fora do escopo: Fase 4 (rate limit, teto
> diário, métricas).

## Decisões já travadas

- Embeddings: **Voyage AI** (`voyage-4-lite`, `outputDimension: 512`) — não
  `voyage-3-lite` como no plano original (modelo saiu de linha).
- Acesso: **só usuário logado** (schema simplificado — sem `session_token`
  anônimo do plano original, usa `user_id = auth.uid()` direto).
- Geração: provedor **trocável** via `lib/chat/llm.ts` (`CHAT_LLM_PROVIDER`).
  Atualmente **Gemini** (`gemini-3-flash-preview`, free tier) — trocado do
  Anthropic Claude Haiku em 2026-08-02 pra evitar custo enquanto o site está
  em desenvolvimento sem usuários. Pra voltar ao Anthropic:
  `CHAT_LLM_PROVIDER=anthropic` + preencher `ANTHROPIC_API_KEY` em
  `.env.local` — nenhum outro código muda.
- Persona: chat usa o mascote **Gambito** (já usado no tour guiado e na home),
  não um assistente genérico.

## Código — já implementado

- `docs/kb/*.md` (7 documentos-fonte, base de conhecimento).
- `supabase/migrations/048_chat_kb.sql` + `scripts/apply-048.mjs` (extensão
  `vector`, tabela `kb_chunks`, RPC `match_kb_chunks`).
- `supabase/migrations/049_chat_sessions.sql` + `scripts/apply-049.mjs`
  (`chat_sessions`, `chat_messages`, RLS).
- `lib/chat/chunk.ts`, `lib/chat/embeddings.ts`, `lib/chat/prompt.ts`,
  `lib/chat/llm.ts` (+ testes em `lib/chat/__tests__/`).
- `scripts/index-kb.ts` (indexação, `npm run index-kb`).
- `scripts/smoke-kb.ts` (teste de qualidade de busca, `npm run smoke-kb`).
- `app/api/chat/message/route.ts` (rota da API, RAG + `generateAnswer`).
- `lib/hooks/use-chat.ts`, `components/chat/chat-bubble.tsx`,
  `components/chat/chat-widget.tsx` (widget flutuante com persona Gambito).
- `app/layout.tsx` monta `<ChatWidget />`.
- `.env.local.example` documentado.

## Já publicado (commit `be7496e`, 2026-08-01)

Deployado propositalmente sem chave de LLM/migrations rodadas — decisão do
usuário, site em desenvolvimento sem usuários reais expostos ao widget
quebrado:

- Rename "Único" → "Absoluto" (código, sem migration de dados).
- Link de inscrição só visível quando `status === 'registration'`.
- Todo o código do chatbot (widget aparece pra usuário logado, mas erra até
  os bloqueios abaixo serem resolvidos).

## Troca Gemini (2026-08-02)

- `lib/chat/llm.ts` (novo): abstrai `generateAnswer()`, escolhe provedor via
  `CHAT_LLM_PROVIDER` env var. Modelo: `gemini-3-flash-preview` (free tier;
  `gemini-2.5-flash`/`gemini-2.0-flash` já não estão disponíveis pra contas
  novas — checar `ai.google.dev/gemini-api/docs/models` se voltar a quebrar).
- `app/api/chat/message/route.ts`: usa `generateAnswer()` em vez de chamar
  Anthropic direto.
- `scripts/index-kb.ts`: `embedWithRetry()` — conta Voyage sem cartão
  cadastrado cai pra 3 RPM, sem retry o script quebrava no 2º chunk. Retry
  fixo de 21s só existe aqui (script offline); `embedQuery` em tempo de
  request (route.ts) fica sem retry de propósito, pra não estourar timeout
  da função serverless.
- `package.json`: nova dependência `@google/genai`.
- `.env.local.example` / `.env.local`: `CHAT_LLM_PROVIDER=gemini` +
  `GEMINI_API_KEY` preenchida.

## Migrations e indexação — feito em 2026-08-02

- Migrations 048 e 049 rodadas pelo usuário.
- `npm run index-kb`: 7/7 chunks indexados (rate limit da Voyage — 3 RPM sem
  cartão — bateu 2x, retry resolveu).
- `npm run smoke-kb`: busca semântica funcionando, similaridade 0.5-0.6 nas
  perguntas testadas. Script em si não tem retry (10 perguntas seguidas
  estouram os 3 RPM da Voyage) — normal, é só ferramenta de review manual.
- Geração via Gemini testada ponta a ponta (`generateAnswer`) — respondeu
  certo com contexto de exemplo.

## KB expandida (2026-08-02)

- `docs/kb/conceitos-basicos-de-xadrez-e-torneio.md` (novo): vocabulário geral
  — pontuação, sistema suíço, mesa, W.O., os **dois tipos de bye** deste
  sistema (bye de pareamento = automático, ímpar de jogadores, 1 ponto cheio;
  bye solicitado = organizador marca ausência antes da rodada, 0,5 ou 0 ponto
  conforme `requested_bye_score` do torneio) e rating. Motivado por um teste
  real onde o Gambito não sabia explicar "bye solicitado".
- Reindexado (`npm run index-kb`) e busca confirmada (`match_kb_chunks`
  retorna esse doc pra "o que é um bye solicitado?", similaridade 0.32).

## Fase 3 — Escalonamento para humano (2026-08-02)

Adaptado do plano original (§6/§7) com 2 desvios deliberados:

1. **Sem Realtime.** O próprio plano já sinalizava isso como maior risco
   técnico do projeto (nunca usado aqui). Widget e painel usam
   `refetchInterval` (polling a cada 3s) enquanto a sessão está em
   atendimento — o próprio plano já citava isso como fallback aceitável.
2. **Resposta do humano nunca se revela como humana pro usuário.** Gravada
   com `role='assistant'` (igual ao bot), não um `role='operator'` à parte —
   pedido explícito do usuário: a ilusão "é sempre o Gambito" não pode
   quebrar. `chat_messages.is_human` guarda a distinção só pra você, nunca é
   lido pelo widget do usuário.

**Timeout de 3 minutos**: se o admin não responder em 3 min depois da
escalada (`chat_sessions.escalated_at`), o widget mostra um formulário
pedindo celular — comparação de timestamp no cliente (`chat-widget.tsx`),
sem job agendado, igual o plano original sugeria (lá era e-mail, aqui é
celular, por pedido do usuário).

Arquivos:

- `supabase/migrations/051_chat_escalation.sql` + `scripts/apply-051.mjs`:
  enum `chat_session_status` ganha `aguardando_humano`/`humano`;
  `chat_sessions` ganha `escalated_at`/`contact_phone`; `chat_messages` ganha
  `is_human`.
- `app/api/chat/escalate/route.ts`: usuário pede atendente → status vira
  `aguardando_humano`, grava mensagem de confirmação (como Gambito), notifica
  admin via push (`sendOperatorNotification`, `lib/push.ts`) — falha de push
  não derruba a escalada (try/catch), só fica sem aviso imediato.
- `app/api/chat/reply/route.ts`: admin responde (gate `role='admin'`) — grava
  `role='assistant', is_human=true`, status vira `humano`.
- `app/api/chat/contact/route.ts`: grava o celular na sessão + mensagem no
  histórico, quando o timeout de 3 min dispara no widget.
- `app/api/chat/message/route.ts`: se a sessão já está
  `aguardando_humano`/`humano`, não chama mais o bot — só grava a pergunta e
  devolve `answer: null`.
- `components/tournament/notify-button.tsx`: `tournamentId` virou opcional
  (+ `activeLabel`/`idleLabel`), reaproveitado pro botão de notificação do
  admin sem precisar duplicar toda a lógica de Service Worker/VAPID.
- `app/admin/dev/chat/page.tsx`: sessões `aguardando_humano` sobem pro topo
  com badge; abre direto na sessão certa via `?session=<id>` (link da
  notificação push); caixa de resposta quando a sessão está escalada.
- `lib/push.ts`: `sendOperatorNotification()` — notifica todo `user_profiles`
  com `role='admin'`.

**Bloqueio conhecido**: `VAPID_EMAIL`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`/
`VAPID_PRIVATE_KEY` não existem em `.env.local` (só devem estar configuradas
na Vercel, onde o recurso de notificação de torneio já funciona) — localmente,
chamar `/api/chat/escalate` grava tudo certo no banco mas a notificação push
falha silenciosamente (capturado, não quebra a escalada).

## App Android do admin (2026-08-02)

Projeto irmão `workspace-gambito-admin` (fora deste repo) — Kotlin/Compose,
fala direto com o Supabase via `supabase-kt`, sem API própria. 3 abas: ver
conversas + responder escalonamento, ver `error_logs`, ver
`unanswered_questions` — as duas últimas só leitura. Detalhes de arquitetura
e build no `README.md` do próprio projeto.

- `supabase/migrations/052_chat_admin_write.sql`: liberou
  `chat_messages_insert_admin`/`chat_sessions_update_admin` (RLS,
  `role='admin'`) — o app escreve a resposta direto, sem passar pela API
  route do site.

## Tool calling — perguntas de dado ao vivo (2026-08-02)

RAG puro (busca em `docs/kb`) não serve pra "quantos torneios tem no MS" ou
"quantos eu tenho" — precisa de contagem real no banco. `lib/chat/tools.ts`
define 3 ferramentas (Gemini function calling), loop em
`lib/chat/llm.ts::generateWithGemini`:

- `contar_torneios_por_estado`: só torneio público/não-rascunho.
- `contar_meus_torneios`: sempre filtrado por `ctx.userId` (da sessão
  autenticada), nunca id que o modelo mande — sem risco de vazar dado de
  outro usuário.
- `registrar_pergunta_sem_resposta`: chamada antes do bot dizer "não sei" —
  grava em `unanswered_questions` (migration 055) pra revisão manual depois
  (sinal de doc faltando ou funcionalidade faltando). Painel:
  `/admin/dev/unanswered` (site) + aba "Sem resposta" (app Android).

Gotcha real descoberto testando: modelos Gemini com thinking exigem ecoar o
`thoughtSignature` do `Part` de volta na próxima chamada do loop, senão a
API rejeita com 400 "Function call is missing a thought_signature" — ver
`lib/chat/llm.ts` (usa `response.candidates[0].content.parts`, não o getter
`response.functionCalls`). Documentado também no `CLAUDE.md` principal.

## Log de erros centralizado (2026-08-02)

Pedido do usuário: capturar erro não esperado (client e server) numa
tabela consultável depois, sem depender de log da Vercel. `error_logs`
(migration 053), gravado via `lib/log-error.ts` (server) ou
`/api/log-error` + `lib/log-error-client.ts` (client: `app/error.tsx`,
`app/global-error.tsx` novo, `components/error-logger.tsx` novo pra
`window.onerror`/`unhandledrejection`, que os error boundaries do Next não
cobrem). Painel: `/admin/dev/errors` (site) + aba "Erros" (app Android).
Só 3 rotas de API já tinham catch-all de erro inesperado pra plugar
(`chat/message`, `export/trf`, `rounds/generate`) — as outras usam
`console.error` só em catches de push notification (não-fatal por design),
não mexidas.

## Verificado em navegador de verdade (2026-08-02, antes de publicar)

- `e2e/chat.spec.ts`: pergunta real → resposta real da KB (Gemini).
  Corrigido um seletor frágil (`.last()` pegava a bolha do usuário por
  engano num timing específico depois da UI otimista) — trocado por
  `.justify-start p.whitespace-pre-wrap` (só lado do Gambito).
- `e2e/chat-escalation.spec.ts` (novo): fluxo completo de ponta a ponta —
  usuário escala, admin responde em `/admin/dev/chat`, usuário recebe via
  polling. Sessão seedada direto no banco (não gasta cota do Gemini).
  Achado real de timing: se a sessão de chat já existe via localStorage na
  primeira carga pós-login, a query de mensagens pode disparar antes do
  cliente Supabase do browser hidratar a sessão de auth — resolvido com
  reload após login no teste; ver nota no `CLAUDE.md` principal sobre se
  isso é uma fragilidade real de produção (caso raro: usuário com sessão de
  chat persistida recarregando a página a frio) ou só do ambiente de teste.
- `e2e/admin-panels.spec.ts` (novo): `/admin/dev/errors`,
  `/admin/dev/unanswered`, `/admin/dev/chat` e os links no painel dev
  carregam sem quebrar pra `role='admin'`.
- Ferramentas de contagem testadas com dado real (10 torneios no MS,
  conferido por query direta) e a ferramenta de pergunta-sem-resposta
  confirmada sendo chamada corretamente pelo modelo.

## Ainda pendente

- Confirmar se a corrida de auth-hydration encontrada no teste de
  escalonamento é só do ambiente de teste (cold-start com localStorage
  pré-setado antes de qualquer carregamento) ou pode acontecer de verdade
  pra um usuário com sessão de chat persistida recarregando a página — não
  investigado a fundo, não bloqueou o deploy.
- Se quiser tirar o teto de 3 RPM da Voyage (só importa se reindexar a KB
  com muito mais documentos no futuro): cadastrar cartão em
  dashboard.voyageai.com — tokens grátis continuam valendo.
- Fase 4 do plano original (rate limit por sessão/IP, teto diário de
  chamadas, métricas) segue fora de escopo.
