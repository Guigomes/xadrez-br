# Plano de Implantação — Chatbot de Suporte com Base de Conhecimento

> Plano para o assistente de suporte ao usuário: bot RAG sobre base de
> conhecimento própria, com escalonamento para atendimento humano.
> Elaborado em 2026-07-31. Status: **proposta, não implementado**.

---

## 1. Objetivo e escopo

Reduzir o volume de dúvidas repetidas de organizadores e inscritos ("como abro
inscrição?", "por que a aba Rodadas não aparece?", "como mudo a classificação
de um jogador?") com um chat que responde a partir da documentação do próprio
sistema — e, quando não resolve, chama um humano.

**Dentro do escopo:**

- Base de conhecimento em markdown, versionada no repo.
- Busca semântica (RAG) sobre essa base.
- Widget de chat flutuante, disponível em toda a área logada.
- Escalonamento para humano com notificação push ao operador.
- Painel de atendimento em `/admin` para assumir conversas.

**Fora do escopo desta fase:**

- Múltiplos atendentes simultâneos com fila/roteamento (assume-se **um**
  operador — você). O schema não impede evoluir, mas a UI não trata disputa.
- Histórico de conversa persistente entre sessões do mesmo usuário anônimo.
- O bot **executar ações** no sistema (criar torneio, aprovar inscrição). Ele
  só responde e aponta caminho. Ver §9.

---

## 2. Arquitetura

```
┌──────────────────── Vercel (Next.js) ─────────────────────┐
│                                                            │
│  ChatWidget (client)          API routes (Node runtime)    │
│  ┌────────────────────┐       ┌──────────────────────────┐ │
│  │ bolha flutuante    │─POST─▶│ /api/chat/message        │ │
│  │ lista de mensagens │       │  1. rate limit           │ │
│  │ botão "falar com   │       │  2. embed(pergunta)      │ │
│  │  atendente"        │       │  3. rpc match_kb_chunks  │ │
│  └────────┬───────────┘       │  4. Claude API (Haiku)   │ │
│           │                   │  5. grava chat_messages  │ │
│           │ Realtime          └──────────────────────────┘ │
│           │ (postgres_changes)┌──────────────────────────┐ │
│           │                   │ /api/chat/escalate       │ │
│  AdminChatPanel (client)      │  status=aguardando       │ │
│  ┌────────────────────┐       │  + sendPushToOperator()  │ │
│  │ lista de sessões   │◀──────┴──────────────────────────┘ │
│  │ conversa + envio   │ Realtime                           │
│  └────────────────────┘                                    │
└────────────────────────────────────────────────────────────┘
                     │                        │
                     ▼                        ▼
┌──────────── Supabase ────────────┐  ┌──────────────────┐
│ pgvector: kb_chunks              │  │ Anthropic API    │
│ chat_sessions / chat_messages    │  │ Haiku + embed*   │
│ RLS por session_token / admin    │  └──────────────────┘
│ Realtime publication nas 2 tbls  │
└──────────────────────────────────┘
```

\* A Anthropic não oferece endpoint de embeddings. Ver §4 para a decisão
de provedor.

**Princípios herdados do projeto** (ver `CLAUDE.md`):

1. Chave de API **nunca** no cliente. Toda chamada ao modelo passa por API
   route Node.
2. RLS em toda tabela nova.
3. Migration idempotente, numeração sequencial.

---

## 3. Base de conhecimento

Fonte da verdade: `docs/kb/*.md` — um arquivo por tema, com frontmatter:

```markdown
---
title: Abrindo as inscrições de um torneio
audience: organizador   # organizador | inscrito | ambos
slug: abrir-inscricoes
---

O status do torneio controla quando o formulário público abre...
```

Temas iniciais sugeridos (derivados das dúvidas que já apareceram na prática):

| Arquivo | Cobre |
|---|---|
| `ciclo-de-vida-torneio.md` | draft → published → registration → registration_closed → ongoing → finished, e o que cada um libera |
| `classificacao-e-emparceiramento.md` | diferença entre os dois, como gerar, quando aparece |
| `inscricoes.md` | período, comprovante, ID CBX obrigatório, aprovação |
| `rodadas-e-pareamento.md` | gerar, publicar, lançar resultado, reabrir |
| `participantes.md` | cadastro manual vs inscrição, edição, grupo obrigatório |
| `classificacao-final.md` | critérios de desempate, ordem, impressão |
| `conta-e-permissoes.md` | organizador, árbitro, staff por torneio |

**Ingestão**: script `scripts/index-kb.mjs` que lê os `.md`, quebra em chunks
(~500 tokens, com overlap de ~50 para não cortar no meio de um passo),
gera embedding de cada chunk e faz upsert em `kb_chunks`. Rodado à mão quando
a documentação muda — não precisa de automação nesta fase.

O `content_hash` por chunk evita re-embeddar o que não mudou (o custo já é
baixo, mas torna o script idempotente e rápido de rodar repetidamente).

---

## 4. Decisão: provedor de embeddings

A Anthropic **não** tem API de embeddings. Três caminhos:

| Opção | Prós | Contras |
|---|---|---|
| **Voyage AI** (`voyage-3-lite`) | Recomendado pela própria Anthropic, barato, qualidade alta | Mais um provedor/chave/conta |
| **OpenAI** (`text-embedding-3-small`) | Ubíquo, barato, 1536 dims | Mais um provedor, e é concorrente |
| **Full-text search do Postgres** (`tsvector`, sem embeddings) | Zero dependência nova, zero custo, já existe no Supabase | Não pega sinônimo ("emparceirar" vs "parear" vs "sortear mesas") — que é exatamente onde usuário leigo erra |

**Recomendação: Voyage AI.** A base é pequena e em português com jargão de
xadrez; busca lexical pura vai falhar justamente nas perguntas mal formuladas,
que são a razão de existir do chatbot.

**Alternativa pragmática se não quiser um terceiro provedor:** começar com
`tsvector` (é uma migration e zero chave nova), medir onde erra com perguntas
reais, e trocar por embeddings depois. A interface do `match_kb_chunks` pode
ser mantida idêntica nos dois casos, então a troca fica isolada.

---

## 5. Schema (migration `043_chat_support.sql`)

> Numeração: a última aplicada é `042_require_cbx_id.sql`.

```sql
create extension if not exists vector;

-- Base de conhecimento indexada
create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_slug text not null,
  doc_title text not null,
  audience text not null default 'ambos',
  chunk_index int not null,
  content text not null,
  content_hash text not null,
  embedding vector(512),           -- voyage-3-lite; ajustar se trocar modelo
  created_at timestamptz not null default now(),
  unique (doc_slug, chunk_index)
);

create index if not exists kb_chunks_embedding_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);

-- Sessões de chat
create type chat_session_status as enum ('bot', 'aguardando_humano', 'humano', 'encerrada');

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,   -- anônimo: gerado no cliente, guardado em localStorage
  user_id uuid references auth.users(id) on delete set null,
  tournament_id uuid references tournaments(id) on delete set null,
  status chat_session_status not null default 'bot',
  escalated_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_status_idx
  on chat_sessions (status, last_message_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'operator', 'system')),
  content text not null,
  sources jsonb,                        -- [{doc_slug, doc_title}] usados na resposta
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx
  on chat_messages (session_id, created_at);
```

**RPC de busca** (`security definer`, para o cliente nunca ver a tabela toda):

```sql
create or replace function match_kb_chunks(
  query_embedding vector(512),
  match_count int default 5,
  min_similarity float default 0.3
) returns table (doc_slug text, doc_title text, content text, similarity float)
language sql stable as $$
  select k.doc_slug, k.doc_title, k.content,
         1 - (k.embedding <=> query_embedding) as similarity
  from kb_chunks k
  where k.embedding is not null
    and 1 - (k.embedding <=> query_embedding) >= min_similarity
  order by k.embedding <=> query_embedding
  limit match_count;
$$;
```

**RLS:**

- `kb_chunks`: sem select público direto (só via RPC). Escrita só `service_role`.
- `chat_sessions` / `chat_messages`: select permitido quando
  `session_token` bate com o header/claim da requisição **ou** quando
  `auth_user_role() = 'admin'`. Insert de mensagem do usuário passa pela API
  route (que usa `createAdminClient()`), então a policy do cliente pode ser
  **select-only** — mais simples e mais segura.

**Realtime**: adicionar as duas tabelas à publication:

```sql
alter publication supabase_realtime add table chat_sessions;
alter publication supabase_realtime add table chat_messages;
```

> ⚠️ Realtime **nunca foi usado neste projeto** — é a peça de maior risco
> técnico do plano. Ver §10.

---

## 6. Fases de implantação

### Fase 1 — Base de conhecimento + busca (sem UI)

1. Escrever os 7 arquivos em `docs/kb/`.
2. Migration `043` (só `kb_chunks` + `match_kb_chunks`; deixar as tabelas de
   chat para a fase 2 mantém o rollback simples).
3. `scripts/index-kb.mjs` + rodar.
4. Verificação: script de smoke que roda 10 perguntas reais e imprime os
   chunks recuperados. **Ler a saída de verdade**, não só o exit code — se a
   recuperação estiver ruim aqui, todo o resto herda o erro.

**Entregável testável sem front-end.** Não avançar antes desta fase estar boa.

### Fase 2 — Bot respondendo (sem humano)

1. Migration `044`: `chat_sessions`, `chat_messages`, RLS, publication.
2. `lib/chat/prompt.ts` — system prompt com regra explícita de "responda
   **só** com base no contexto; se não souber, diga que não sabe e ofereça
   falar com atendente".
3. `app/api/chat/message/route.ts` — pipeline embed → match → Claude → grava.
4. `components/chat/chat-widget.tsx` + `chat-bubble.tsx`, montado no layout da
   área logada.
5. `lib/hooks/use-chat.ts` (React Query, seguindo o padrão dos outros hooks).

**Já entrega valor sozinho.** Se parar aqui, o produto é útil.

### Fase 3 — Escalonamento para humano

1. `app/api/chat/escalate/route.ts` — muda status, grava mensagem de sistema,
   chama push.
2. `lib/push.ts` ganha `sendOperatorNotification()` — reaproveita `initVapid()`
   e `sendToSubscriptions()`; busca subs por `user_id` do(s) admin(s).
3. Widget: botão "Falar com atendente", estado de espera, subscribe no Realtime
   do `chat_messages` da própria sessão.
4. `app/admin/chat/page.tsx` — lista de sessões (badge de não lidas), conversa
   aberta, campo de envio. Realtime nos dois lados.
5. `app/api/chat/reply/route.ts` — operador responde (gate: `role='admin'`).

### Fase 4 — Endurecimento

1. Rate limit por `session_token` (ver §8).
2. Timeout de escalonamento: sem resposta do operador em N minutos, o bot
   avisa e oferece deixar contato (ver §7).
3. Métricas simples: perguntas/dia, taxa de escalonamento, perguntas sem
   resposta boa (similarity abaixo do limiar) — essa última lista é o que
   guia quais documentos escrever depois.

---

## 7. Fluxo de escalonamento (detalhe)

```
usuário clica "Falar com atendente"
  └─ POST /api/chat/escalate
       ├─ chat_sessions.status = 'aguardando_humano', escalated_at = now()
       ├─ insere chat_messages(role='system', 'Aguardando atendente…')
       └─ push para o operador  ──▶  notificação abre /admin/chat?session=<id>

operador abre o painel e envia a primeira mensagem
  └─ POST /api/chat/reply
       ├─ status = 'humano'  (bot para de responder a partir daqui)
       └─ insere chat_messages(role='operator')
            └─ Realtime empurra para o widget do usuário

usuário vê "Você está falando com um atendente"
```

**Timeout (fase 4):** se `escalated_at` passar de N minutos sem nenhuma
mensagem `role='operator'`, o widget mostra:

> Ninguém disponível agora. Deixe seu e-mail que respondemos assim que der.

Isso é **importante**, não polimento: sem timeout, a alternativa para o usuário
é ficar olhando uma tela de espera que nunca resolve — pior que não ter tido a
opção. O estado só existe no cliente (comparação de timestamp), não precisa de
job agendado.

---

## 8. Custo e limites

**Indexação**: base de ~7 documentos, uns 15–20 mil tokens no total. Custo de
embedding: centavos, uma vez. Reindexar quando a doc mudar.

**Por pergunta** (Haiku, contexto de ~1–2k tokens de entrada + ~300 de saída):
aproximadamente **US$ 0,001–0,003**. A 1.000 perguntas/mês, **US$ 1–3/mês**.

**Infra**: zero adicional — pgvector e Realtime já estão no plano Supabase
atual; o widget roda na Vercel junto com o resto.

**O risco de custo não é o modelo, é abuso.** Endpoint que chama LLM e aceita
texto arbitrário, exposto sem autenticação, é um convite. Mitigações da fase 4,
em ordem de importância:

1. Rate limit por `session_token` **e** por IP (ex.: 20 mensagens/hora).
2. Limite de tamanho da mensagem de entrada (ex.: 1.000 caracteres).
3. Teto diário global de chamadas — quando estourar, o widget cai para "só
   base de conhecimento" (mostra os chunks encontrados sem gerar resposta).
4. Considerar exigir login para usar o chat. Reduz muito a superfície, ao
   custo de não atender o inscrito anônimo com dúvida antes de se cadastrar —
   que é justamente um público que o chat ajudaria.

---

## 9. Segurança

- **Chave da Anthropic e do provedor de embeddings**: só em variável de
  ambiente server-side (`ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`). Nunca
  `NEXT_PUBLIC_*`. Adicionar ao `.env.local.example` sem valor.
- **O bot não executa ações.** Ele não recebe ferramentas, não escreve no
  banco, não tem contexto de outros usuários. Só recebe: a pergunta, os chunks
  da base, e o histórico da própria sessão. Isso elimina de saída toda a classe
  de ataque de "usuário convence o bot a aprovar a inscrição dele".
- **Conteúdo da base é dado, não instrução.** O system prompt trata os chunks
  recuperados como referência; a base é escrita por você e versionada no repo,
  então não é superfície de injeção externa — mas manter a separação evita
  surpresa se a base virar editável pela UI depois.
- **`session_token`**: gerado com `crypto.randomUUID()` no cliente, guardado em
  `localStorage`. É a credencial de leitura da conversa — a RLS depende dele.
  Não colocar em query string (vaza em log/referrer), mandar em header.
- **Painel do operador**: gate por `role='admin'`, tanto na page quanto na API
  route. Não confiar só em esconder o link.
- **Dados pessoais na conversa**: usuário vai colar e-mail e telefone no chat.
  Definir retenção (ex.: apagar sessões encerradas com mais de 90 dias) antes
  de ligar em produção, não depois.

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| **Realtime é território novo no projeto** | Alto — é a base das fases 3 e 4 | Fazer um spike isolado antes da fase 3: uma página que escuta um insert e mostra na tela. Se der problema (RLS + Realtime é a combinação que costuma morder), o fallback é polling a cada 3s no painel — feio, mas funciona e o usuário do chat nem percebe |
| **Base de conhecimento ruim** | Alto — lixo entra, lixo sai | Fase 1 é entregável testável isolado justamente por isso. Não avançar com recuperação ruim |
| **Operador indisponível** | Médio — piora a experiência vs só bot | Timeout + captura de contato (§7) |
| **Abuso do endpoint de LLM** | Médio — custo e disponibilidade | Rate limit (§8) |
| **Doc desatualizada** | Médio — o bot ensina o fluxo antigo com confiança | A KB fica no repo, ao lado do código; incluir "atualizei a KB?" no checklist de mudança de fluxo. Não há solução automática |
| **Escopo crescer para o bot agir no sistema** | Alto se acontecer sem replanejar | §9 é uma linha deliberada. Cruzar exige plano de segurança novo, não é incremento |

---

## 11. Dependências novas

```
@anthropic-ai/sdk        # chamada ao modelo
voyageai                 # embeddings (ou openai, se trocar §4)
```

Extensão Postgres: `vector` (disponível no Supabase, só habilitar).

---

## 12. Verificação (por fase)

Seguindo o fluxo já estabelecido no projeto:

1. `npx next lint` — zero *Error*.
2. `npx vitest run` — cobrir com teste unitário: o chunker (`lib/chat/chunk.ts`)
   e a montagem do prompt. São puros e é onde bug silencioso mora.
3. Migration: script `apply-NNN.mjs` no padrão existente, conferindo contagem
   exata de tabelas/índices/funções criados — não só "sem erro".
4. E2E (`e2e/chat.spec.ts`): abrir widget, mandar pergunta, receber resposta,
   escalar, e — com um segundo contexto de browser autenticado como admin —
   responder e ver chegar do outro lado. Esse teste é o que prova o Realtime.
5. Deploy: push em `main`, acompanhar o run antes de dar como concluído.

---

## 13. Ordem recomendada de decisão

Antes de escrever código, três respostas travam o resto:

1. **Embeddings ou `tsvector`?** (§4) — muda a migration e as dependências.
2. **Chat aberto a anônimo ou só logado?** (§8) — muda RLS, rate limit e o
   alcance do produto.
3. **Fase 2 já entrega valor. Vale parar ali e medir antes de fazer o
   escalonamento humano?** O atendimento humano é a metade cara em esforço e
   a que depende de você estar disponível.
