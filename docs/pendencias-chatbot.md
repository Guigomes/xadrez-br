# Chatbot de Suporte — Status e Pendências

> Complementa `docs/plano-chatbot-suporte.md`. Registrado em 2026-08-01.
> Escopo decidido: **Fase 1 + Fase 2** do plano original (KB + busca semântica
> + widget de chat). Fora do escopo por agora: escalonamento humano, Realtime,
> painel de atendimento em `/admin` (§7/§8 do plano original).

## Decisões já travadas

- Embeddings: **Voyage AI** (`voyage-4-lite`, `outputDimension: 512`) — não
  `voyage-3-lite` como no plano original (modelo saiu de linha).
- Acesso: **só usuário logado** (schema simplificado — sem `session_token`
  anônimo do plano original, usa `user_id = auth.uid()` direto).
- Geração: **Anthropic Claude Haiku** (`claude-haiku-4-5-20251001`), conta
  paga separada da assinatura do Claude Code (billing diferente, não consome
  `/usage`).
- Persona: chat usa o mascote **Gambito** (já usado no tour guiado e na home),
  não um assistente genérico.

## Código — já implementado (não commitado)

- `docs/kb/*.md` (7 documentos-fonte, base de conhecimento).
- `supabase/migrations/048_chat_kb.sql` + `scripts/apply-048.mjs` (extensão
  `vector`, tabela `kb_chunks`, RPC `match_kb_chunks`).
- `supabase/migrations/049_chat_sessions.sql` + `scripts/apply-049.mjs`
  (`chat_sessions`, `chat_messages`, RLS).
- `lib/chat/chunk.ts`, `lib/chat/embeddings.ts`, `lib/chat/prompt.ts` (+
  testes em `lib/chat/__tests__/`).
- `scripts/index-kb.ts` (indexação, `npm run index-kb`).
- `scripts/smoke-kb.ts` (teste de qualidade de busca, `npm run smoke-kb`).
- `app/api/chat/message/route.ts` (rota da API, RAG + Haiku).
- `lib/hooks/use-chat.ts`, `components/chat/chat-bubble.tsx`,
  `components/chat/chat-widget.tsx` (widget flutuante com persona Gambito).
- `app/layout.tsx` monta `<ChatWidget />`.
- `.env.local.example` documentado; `.env.local` já tem `VOYAGE_API_KEY`
  preenchida (chave enviada pelo usuário em 2026-08-01 — **considerar
  revogar/rotacionar no painel do Voyage, já que ficou registrada em texto
  puro no histórico do chat**).

## Bloqueios — o que só o usuário resolve

1. **`ANTHROPIC_API_KEY`** — ainda vazia em `.env.local`. Sem ela o chat não
   gera resposta (RPC de busca funciona, geração falha).
2. **Rodar as migrations 048 e 049** — precisa `SUPABASE_DB_URL` (senha do
   banco) que o assistente não tem. Rodar via `node scripts/apply-048.mjs` e
   `node scripts/apply-049.mjs`, ou aplicar manualmente no Supabase.
3. Depois das migrations: `npm run index-kb` (indexa `docs/kb/*.md` na
   tabela `kb_chunks`).
4. `npm run smoke-kb` — roda 10 perguntas de teste, valida qualidade da busca
   antes de confiar no bot.
5. Verificação visual do widget no navegador (login necessário — widget só
   aparece logado).

## Também pendente de deploy (commits acumulados, nunca "testado"/"publicado")

Desde o commit `5868223` (última publicação), ficaram acumuladas sem
commit/push, aguardando instrução explícita de "teste"/"deploy":

- Rename "Único" → "Absoluto" (código, sem migration de dados — decisão
  explícita do usuário de não migrar linhas existentes).
- Link de inscrição só visível quando `status === 'registration'`.
- Todo o chatbot (uma vez que os 2 bloqueios acima forem resolvidos).

## Ordem sugerida quando o usuário retomar

1. Usuário fornece `ANTHROPIC_API_KEY`.
2. Usuário roda/autoriza as migrations 048 e 049.
3. `npm run index-kb` e `npm run smoke-kb`.
4. Pedido explícito de "teste" → lint + vitest + verificação visual do
   widget.
5. Pedido explícito de "deploy"/"publicar" → commit (mensagem explicando o
   porquê) + push + monitorar deploy, cobrindo também o rename
   Único→Absoluto e o link de inscrição condicional que ainda não foram
   publicados.
