# CLAUDE.md — chess-viewer

Guia para sessões futuras do Claude Code neste repositório. Contexto completo da feature "torneios nativos" está em `docs/`.

## O que é este projeto

Plataforma de gestão de torneios de xadrez suíços (Next.js 15 + Supabase + Vercel). Dois modos de torneio coexistem:

- **`mode='native'`** (padrão, implícito para o organizador): o próprio sistema pareia rodadas com motor FIDE Dutch (bbpPairings compilado para WASM), gerencia inscrições, resultados, staff.
- **`mode='imported'`**: espelha um torneio já rodado no chess-results.com via worker `cron-import` (repo irmão, `Guigomes/xadrez-br-cron`). **Exclusivo do painel `/admin/dev`** — usuário comum nunca escolhe isso; só quem tem `role='admin'`.

Repo separado: `cron-import` (Cloud Run Job, worker de importação) — vive em `../cron-import` neste workspace, próprio git.

## Documentos de referência (leia antes de mexer em pareamento nativo)

- `docs/requisitos-torneios-nativos.md` — requisitos funcionais (RF-1 a RF-11)
- `docs/design-tecnico-torneios-nativos.md` — arquitetura completa, schema, TRF, RPCs
- `docs/spike-f0-wasm.md` — resultado do spike do motor WASM (achados críticos abaixo)

## Arquitetura essencial

- **RPC Postgres como única porta de mutação de estado estrutural.** Nunca fazer `UPDATE` direto do cliente em `rounds.status`, `tournaments.status` (fora do stepper já existente), `tournament_players`, etc. Toda transição de rodada/inscrição passa por RPC `security definer` (ver `supabase/migrations/020_lifecycle_rpcs.sql`, `025`, `026`).
- **TRF(bx) é o formato pivô**: mesmo serializador (`lib/pairing/trf/serialize.ts`) alimenta a engine de pareamento E a exportação de homologação FIDE/CBX. Dois modos: `serializeForPairing` (entrada da engine) e `serializeForExport` (homologação, todas as rodadas).
- **Engine bbpPairings roda em WASM** dentro de API route Node (`lib/pairing/engine.ts`), instância nova por chamada, sem estado compartilhado. Artefatos commitados em `lib/pairing/wasm/` (não regenerar sem necessidade — ver `scripts/build-bbppairings.sh`).
- **RLS em toda tabela sensível.** Helpers centrais: `auth_user_role()`, `is_tournament_manager()`, `is_tournament_organizer()`, `is_organizer_or_admin()`, `is_arbiter_or_admin()` (migration 002, 018, 026).

## Achados críticos do spike WASM (não redescobrir)

- `-fexceptions` é **obrigatório** no build Emscripten — sem ele, erro de validação do TRF vira `abort()` mudo em vez de exit code 3 legível.
- Exit codes do bbpPairings: `0` sucesso, `1` **sem pareamento válido** (caso de negócio, não bug — grupo pequeno já se enfrentou tudo), `2` erro inesperado, `3` entrada inválida, `4` limite de tamanho, `5` erro de arquivo.
- `XXC white1|black1` é **obrigatório** (bbpPairings não sorteia cor, ao contrário do JaVaFo).
- bbpPairings **não é endossado pela FIDE isoladamente** — é o motor Dutch por trás do SwissSys (que É endossado). Nosso sistema completo nunca passou por endosso formal da FIDE. TRF exportado deve ser tratado como rascunho para revisão de árbitro humano, não homologação automática.

## Modelo de permissão (mudou nesta sessão — não confundir as duas camadas)

1. **`user_profiles`** (conta, global): `role` é só `admin` vs resto (não mais categoria única). `is_organizer`, `is_arbiter`, `is_participant` são **flags independentes que coexistem** — uma pessoa pode ser as três. Inscrição em torneio (`tournament_registrations`) continua aberta a qualquer um mesmo sem `is_participant` marcado; a flag existe pra habilitar **autopreenchimento** do formulário de inscrição a partir do perfil (migrations 027/028) e alimentar de volta o perfil após inscrever (best-effort, não bloqueia a inscrição se falhar). "Novo torneio" só aparece pra quem tem `role=admin` ou `is_organizer` (gate em `app/admin/page.tsx` e `app/admin/tournaments/new/page.tsx`).
2. **`tournament_staff`** (por torneio): `role` organizer/arbiter delegado por torneio específico, independente do perfil global.
3. **`board_arbiters`** (por mesa, dentro de um grupo): atribuição de árbitro por número de mesa, **persiste entre rodadas** até troca explícita.

Trigger `trg_prevent_role_escalation` (migration 026) bloqueia usuário comum de alterar o próprio `role` via update direto — só passa se quem está autenticado já for admin, ou se não houver `auth.uid()` (contexto de serviço).

## Convenções deste projeto

- **Migrations**: numeração sequencial (`NNN_nome.sql`), sempre idempotentes (`if not exists`, `create or replace`). Há uma colisão histórica de dois arquivos `011_*` (renomeado, ver migration 012) — não repetir número.
- **Scripts de aplicação de migration**: usar o padrão em `cron-import/apply-*.mjs` (conexão `pg` direta com a connection string do `.env`). **Atenção a IPv6**: o host direto do Supabase só resolve por IPv6; se a rede local não tiver rota IPv6 (`ENETUNREACH` em teste TCP), a conexão falha mesmo com DNS ok. Nesse caso, verificações **read-only** podem ser feitas via REST API do Supabase (`curl` com a `service_role` key do `.env.local`, HTTPS puro, não depende de IPv6) — mas mutações (POST/PATCH) por esse caminho tendem a ser bloqueadas pelo classificador de permissões do agente.
- **Lint**: `npx next lint` deve dar zero *Error* (warnings de `no-explicit-any` são pré-existentes e tolerados). `next.config.js` tem `typescript.ignoreBuildErrors: true` — há ~300+ erros de tipo pré-existentes em todo o projeto (cliente Supabase sem generic `Database`), não é regressão introduzir mais um em código novo, mas não vale tentar zerar isso de uma vez.
- **`npm run build` local falha com `EISDIR`** em máquina Windows — confirmado que é ambiente local, não o código (a main limpa falha igual). A Vercel builda em Linux normalmente; esse é o gate real, não o build local.
- **Testes**: `npx vitest run lib/pairing` — golden tests contra fixtures reais do bbpPairings upstream (`lib/pairing/__tests__/fixtures/`, licença Apache 2.0 preservada).
- **Deploy**: push em `main` dispara GitHub Actions → Vercel (produção direta, sem branch de preview neste fluxo). Sempre conferir o resultado do run (`gh run list` / `gh run watch`) antes de dar como concluído.

## Erros de UX já cometidos e corrigidos (não repetir o padrão)

- **Spinner infinito por comparação com `null`**: `statusSaving === prevStatus` quando ambos podem ser `null` em estados diferentes (idle vs "não há estágio anterior") dá falso positivo. Sempre checar truthy explícito antes de comparar dois valores potencialmente nulos com significados distintos.
- **Cabeçalhos duplicados/inconsistentes por página**: antes de adicionar um link de navegação num header de página admin, checar se `components/admin/admin-tournament-tabs.tsx` (o layout compartilhado em `app/admin/tournaments/[slug]/layout.tsx`) já cobre isso — não duplicar.
- **Card de import do chess-results sem guarda de modo**: qualquer feature exclusiva de um modo (`native`/`imported`) precisa checar `tournament.mode` explicitamente na UI, não só confiar na RLS/trigger do banco (que bloqueia mas não esconde, gerando erro feio em vez de a opção simplesmente não aparecer).
- **Registro manual de jogador sem grupo**: ao adicionar `tournament_players` em torneio nativo, `pairing_group_id` é obrigatório (trigger recusa). Toda tela que insere participante precisa oferecer o seletor de grupo, não só o RPC de pareamento.
- **`approve_registration` reaproveitando `players` por nome sem atualizar dado novo** (migration 046): o find-or-create casa por CBX/FIDE/nome; ao achar um `players` já existente, só `sex` era retroalimentado (se nulo) — `birth_year`/`city`/`federation`/`fide_id`/`cbx_id`/`rating_std` da inscrição nova eram descartados em silêncio. Sintoma: segunda inscrição pro mesmo nome com idade preenchida aprovava sem classificação (derive_player_category depende de `birth_year`). Qualquer UPDATE de "enriquecer cadastro existente com dado novo" precisa cobrir todos os campos que a inscrição pode trazer, não só o que motivou o bug original.
- **Campo "puramente informativo" que devia ter virado regra e não virou** (migration 044 → 047): `tournaments.start_time` nasceu só pra exibição, mas a regra automática de status (`next_status_by_date`) continuou comparando só `start_date`, então um torneio com horário à noite virava `ongoing` de manhã. Ao adicionar um campo de horário/data granular numa tabela que já tem uma regra de transição por data, checar se essa regra não devia (ou já devia) considerar o campo novo — "informativo" às vezes é só o estado inicial antes de alguém pedir que passe a valer.
- **Reaproveitar componente feito pra redirect dentro de um embed inline**: `ClassificationSetup` (aba Editar) tinha `window.scrollTo(0, 0)` forçado ao carregar — fazia sentido lá (destino de um redirect, página curta antes do conteúdo chegar). Ao embutir o mesmo componente no meio da tela de criação (opção "Personalizado", sem navegar), esse scroll forçado virava exatamente o "pula a página" que o usuário reclamou. Precisou de prop (`autoScrollTop`, default `true`) pra desligar só no caso embutido. Mesmo componente também renderizava a seção "Classificação" de novo, duplicada, empurrando o "Emparceiramento" pra baixo — a tela de criação já mostra essa parte no rascunho acima; precisou de outra prop (`showClassification`, default `true`) pra esconder só no embed. Regra geral: componente feito pra uso standalone (efeito colateral de página inteira, ou seções que fazem sentido sozinhas) pode duplicar conteúdo ou quebrar quando embutido no meio de outra tela — sempre checar isso, e preferir prop opcional (default = comportamento antigo) a duplicar o componente.
- **Botão de resultado que some ao invés de destacar** (painel do árbitro, `rounds/[roundId]/results/page.tsx`): lançar resultado trocava os botões por texto — corrigir exigia achar um link "corrigir" escondido. Pedido do usuário: pra uma ação que pode ser revertida/alterada até um estado fechar (rodada encerrar), o controle que a disparou devia continuar visível e clicável, só destacando a opção atual — não sumir e virar outra coisa.
- **Emparceiramento saiu da tela de criação e virou aba própria** (`app/admin/tournaments/[slug]/groups`, antes um redirect morto pra `/edit`): decidir "por idade/rating/personalizado" na hora de criar exigia embutir `ClassificationSetup` inline (ver bullet acima) só pra liberar o mapeamento "Personalizado". Trocado por: criação decide só Classificação (emparceiramento sempre nasce `absolute`, grupo "Absoluto"); emparceiramento de verdade (incluindo trocar pra `custom`) mora numa aba separada, disponível a qualquer momento depois. Corolário: `pairing_mode='custom'` sem grupo criado ou com classificação sem grupo mapeado deixa o torneio num estado que `enforce_native_pairing_group` rejeitaria no primeiro jogador aprovado — por isso "Publicar" (`admin-tournament-chrome.tsx`) trava nesse caso, calculado em `layout.tsx` (`pairingReady`).

## Fluxo de trabalho — gated por pedido explícito (não antecipar etapa)

Pedido de **alteração** ("muda X", "corrige Y") → só:
1. Editar código (achar causa raiz antes, não só sintoma/UI).
2. Se houver migration nova: criar `supabase/migrations/NNN_nome.sql` idempotente + `scripts/apply-NNN.mjs` seguindo o padrão existente — mas **não rodar** a menos que peçam pra testar/publicar.

Pedido de **testar** ("testa isso", "confere se funciona") → adiciona:
3. `npx next lint` (esperar 0 *Error*) + `npx vitest run lib/pairing` quando mexeu em pareamento.
4. Rodar migration nova (`apply-NNN.mjs` ou SQL direto) se ainda não rodou.
5. Verificar visual/comportamento (preview local no browser) quando a mudança for observável ali.

Pedido de **publicar/push** ("publica", "sobe", "faz push") → adiciona:
6. Commit em português, mensagem explicando o *porquê*, não só o *o quê*.
7. `git push origin main`.
8. Monitorar o deploy (`gh run watch` em background) antes de reportar concluído.
9. Registrar no `CLAUDE.md` (seção "Erros de UX já cometidos" ou equivalente) se foi bug/padrão que vale não repetir.

**Não pular etapas de um pedido pro outro** — "muda X" não implica testar nem publicar; "testa" não implica publicar. Só avança de fase quando o usuário pedir explicitamente.

## Ambiente de teste

- **Confirmação de e-mail está desativada no Supabase Auth deste projeto.** Dá pra criar usuário de teste direto pela tela de cadastro (`/` → "Cadastre-se") com e-mail/senha inventados — loga na hora, sem precisar clicar em link de confirmação. Útil pra verificar telas do painel admin (`/admin/...`) que exigem login.
- Usuário novo nasce sem `role='admin'` nem `is_organizer` — pra acessar "Novo torneio" e demais telas de organizador, precisa marcar `is_organizer=true` (ou `role='admin'`) em `user_profiles` direto no banco após o cadastro.

## Chatbot de suporte (Gambito) — RAG + tool calling + escalonamento

Plano original em `docs/plano-chatbot-suporte.md`; desvios e status real em `docs/pendencias-chatbot.md` (leia antes de mexer, tem histórico de todas as migrations 048-055).

- **Arquitetura**: pergunta → embedding (Voyage AI `voyage-4-lite`) → `match_kb_chunks` (pgvector, `kb_chunks`) → contexto no prompt (`lib/chat/prompt.ts`) → Gemini gera resposta, com **tool calling** disponível pra 3 ferramentas (`lib/chat/tools.ts`): contar torneios por estado, contar meus torneios, registrar pergunta sem resposta. Loop de tool-calling fica em `lib/chat/llm.ts` (`generateWithGemini`), só implementado pro provedor Gemini — se voltar pro Anthropic (`CHAT_LLM_PROVIDER=anthropic`), essas 3 ferramentas param de funcionar até ganharem tool use lá também.
- **Provedor de LLM é trocável** (`CHAT_LLM_PROVIDER` env var) — decisão de custo, não de arquitetura. Free tier do Gemini (`gemini-3-flash-preview`) é **só 20 requisições/dia por modelo** (bem mais restrito do que a doc geral do Gemini sugere) — fácil de estourar rodando os e2e de chat várias vezes seguidas no mesmo dia. Erro nesse caso é 429 `RESOURCE_EXHAUSTED`, `chat_messages` fica sem resposta do assistente, widget mostra "Erro ao gerar resposta".
- **Gemini com thinking exige ecoar `thoughtSignature` de volta** na chamada seguinte de um loop de tool-calling, senão a API rejeita com "Function call is missing a thought_signature". Por isso `generateWithGemini` usa `response.candidates[0].content.parts` (o Part cru) em vez do getter de conveniência `response.functionCalls` (que descarta esse campo).
- **Escalonamento pra humano (Fase 3, migration 051)**: sem Realtime (maior risco técnico do projeto, nunca usado aqui) — widget e painel usam polling (`refetchInterval`). Resposta do admin grava como `role='assistant'` (nunca `'operator'`) — decisão do usuário: a ilusão "é sempre o Gambito" nunca quebra pro usuário final; `chat_messages.is_human` guarda a distinção só pra revisão interna.
- **App Android do admin** (`workspace-gambito-admin`, projeto irmão fora deste repo): fala direto com o Supabase via `supabase-kt`, autenticado como a própria conta admin — sem API própria. Liberado por policies de escrita direta (`chat_messages_insert_admin`/`chat_sessions_update_admin`, migration 052) que o painel web não precisa (usa `service_role` via `/api/chat/reply`).
- **Log de erros** (`error_logs`, migration 053) e **perguntas sem resposta** (`unanswered_questions`, migration 055): duas tabelas de observação, só admin lê (`/admin/dev/errors`, `/admin/dev/unanswered`, e as mesmas telas no app Android). Escrita sempre via `service_role` (`lib/log-error.ts`) ou pela ferramenta de tool-calling — nenhuma das duas tem policy de insert pro client comum.

### Testando o chat em e2e (Playwright) — pegadinha de sessionId

`ChatWidget` lê `xbr_chat_session_id` do localStorage **uma única vez**, no `useEffect` de mount (dependências vazias) — e como ele mora no layout raiz, não desmonta na navegação client-side entre `/login` e `/admin`. Setar o valor via `page.evaluate()` **depois** de `page.goto('/login')` não funciona: o widget já montou e já leu (valor antigo/nulo) antes do `evaluate` rodar. Precisa de `context.addInitScript(...)` (roda antes do JS da página, em toda navegação) — e mesmo assim, se a sessão de chat já existir via localStorage na primeiríssima carga pós-login, a query de mensagens pode disparar antes do cliente Supabase do browser terminar de hidratar a sessão de auth (corrida que o fluxo normal nunca expõe, porque `sessionId` só aparece depois do primeiro round-trip de mensagem, vários segundos depois). Um `page.reload()` + `waitForLoadState('networkidle')` logo após o login resolve. Ver `e2e/chat-escalation.spec.ts`.

## O que NÃO existe ainda (não assumir implementado)

- Exportação de PDF server-side (usa `window.print()` do navegador, páginas `/print` dedicadas).
- Lookup automático de rating pela CBX (não há API pública confirmada — pesquisado, sem solução).
- Endosso formal da FIDE para o sistema completo.
- Suporte a torneios por equipes (fora de escopo desta fase).
