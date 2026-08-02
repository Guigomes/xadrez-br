# Chatbot de Suporte — Status e Pendências

> Complementa `docs/plano-chatbot-suporte.md`. Registrado em 2026-08-01,
> atualizado em 2026-08-02.
> Escopo decidido: **Fase 1 + Fase 2** do plano original (KB + busca semântica
> + widget de chat). Fora do escopo por agora: escalonamento humano, Realtime,
> painel de atendimento em `/admin` (§7/§8 do plano original).

## Decisões já travadas

- Embeddings: **Voyage AI** (`voyage-4-lite`, `outputDimension: 512`) — não
  `voyage-3-lite` como no plano original (modelo saiu de linha).
- Acesso: **só usuário logado** (schema simplificado — sem `session_token`
  anônimo do plano original, usa `user_id = auth.uid()` direto).
- Geração: provedor **trocável** via `lib/chat/llm.ts` (`CHAT_LLM_PROVIDER`).
  Atualmente **Gemini** (`gemini-2.5-flash`, free tier) — trocado do Anthropic
  Claude Haiku em 2026-08-02 pra evitar custo enquanto o site está em
  desenvolvimento sem usuários. Pra voltar ao Anthropic: `CHAT_LLM_PROVIDER=anthropic`
  + preencher `ANTHROPIC_API_KEY` em `.env.local` — nenhum outro código muda.
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

## Ainda pendente

- Verificação visual do widget no navegador de verdade (logado) — não feita
  ainda nesta rodada.
- Se quiser tirar o teto de 3 RPM da Voyage (só importa se reindexar a KB
  com muito mais documentos no futuro): cadastrar cartão em
  dashboard.voyageai.com — tokens grátis continuam valendo.
