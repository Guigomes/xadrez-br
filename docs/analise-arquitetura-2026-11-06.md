# Análise de estrutura, arquitetura e dados — 2026-11-06

Escopo: `chess-viewer` (site Gambito), com olhar sobre `cron-import` (robô) e o banco Supabase compartilhado.
Método: leitura do código, métricas por script e consultas **somente leitura** ao banco de produção
(`pg_stat_*`, `pg_policies`, `pg_constraint`). Nada foi alterado.

## 1. Retrato

| | |
|---|---|
| Código TS/TSX | ~46 mil linhas (app 16,7k · components 13,1k · lib 16,7k) |
| Páginas / rotas API | 78 páginas (37 `'use client'`) · 58 rotas |
| Banco | 63 tabelas · 262 funções (86 `security definer`) · 100 policies · 45 triggers |
| Migrations | 144 arquivos, 13,1k linhas SQL, 142 registradas |
| Testes | 77 arquivos unitários (vitest) · 8 e2e (Playwright, só em PR) |
| Robô `cron-import` | 13 arquivos, 2,8k linhas, escreve nas mesmas tabelas |
| Uso real | 113 torneios: 102 importados, 11 nativos |

### O que está bom (manter)

- **RPC `security definer` como porta única das mudanças de estado** de rodada/inscrição; todas as 86 funções com `search_path` fixo (0 pendências).
- **RLS ligado em 100% das tabelas.** As 14 sem policy são deny-by-default (só `service_role`), coerente com o uso.
- **Tipos do banco gerados** + `type-check`, lint e testes como barreira no CI antes do deploy.
- **Regras puras extraídas e testadas** (`lib/tournament/tv-*`, `podium`, `finance/settlement`, `alerts/match`, `pairing/*`).
- Migrations idempotentes, com registro e `check-migrations`.
- Decisões documentadas (o "porquê" está escrito; raro em projeto deste tamanho).

## 2. Achados por prioridade

### ALTA

**A1. Excluir torneio apaga dinheiro e auditoria em cascata.**
`DELETE /api/admin/tournaments/[slug]` deixa o dono excluir sem guarda. As FKs são `ON DELETE CASCADE` de
`tournaments` para `tournament_registrations` (com `paid_value_cents`, `asaas_payment_id`), `tournament_payouts` e `audit_log`.
Excluir usuário também apaga em cascata `subscriptions` e `report_orders`.
Hoje a cobrança está desligada, mas no primeiro torneio pago um clique apaga o histórico financeiro e a trilha de auditoria.
→ Trocar para `ON DELETE RESTRICT` (ou soft delete com `deleted_at`) nas tabelas financeiras e de auditoria. A RPC de exclusão recusa
torneio com inscrição paga/repasse. Também não devolver `error.message` cru ao cliente.

**A2. Policies RLS reavaliam `auth.uid()` / `auth_user_role()` por linha.**
37 policies chamam `auth.uid()` sem `(select …)`, inclusive as leituras públicas mais quentes
(`tournaments`, `tournament_players`, `rounds`, `pairings`, `standings`, `tournament_categories`).
`auth_user_role()` faz SELECT em `user_profiles`. A policy de `pairings` tem dois `EXISTS` aninhados mais `is_tournament_manager`.
Indício nas estatísticas: `user_profiles` (26 linhas) tem 755 mil seq scans, `tournaments` (113) 3,9 milhões e `rounds` (1.100) 1,9 milhão.
→ Migration que só reescreve as expressões para `(select auth.uid())` e `(select public.auth_user_role())`. A semântica não muda;
o Postgres passa a calcular uma vez por consulta (aviso `auth_rls_initplan` do Supabase Advisor).

**A3. `tournament_players` inchado ~14×.**
São 7.601 linhas de ~178 bytes (~1,3 MB de dado) ocupando 19 MB de heap.
Causa: `sync_player_scores_from_standings` faz UPDATE em **todas** as linhas do torneio a cada ciclo do robô (agora a cada 10 min),
mesmo sem mudança. Cada UPDATE gera nova versão da linha e dos 5 índices.
→ Acrescentar
`and (tp.current_score, tp.current_rank, tp.buchholz, tp.buchholz_cut1, tp.sonneborn_berger, tp.progressive) is distinct from (s.points, s.rank, …)`.
Depois, um `VACUUM FULL tournament_players` em janela calma. Conferir o mesmo padrão no robô para `standings` (590 linhas mortas).

**A4. Trabalho grande fora do git.**
São 23 arquivos modificados e cerca de 30 novos (assinatura do organizador e Jogador+), incluindo 3 migrations não versionadas;
a `20261103180000` já está aplicada no banco. Risco de perda e de divergência entre banco e repositório.
Detalhe de coesão: o WIP torna `podium-photo` **só admin**, o que contradiz a decisão registrada no CLAUDE.md (foto no pódio da TV pública).
Se publicado assim, o pódio público perde as fotos.
→ Commitar em branch, decidir a regra do pódio e versionar as migrations já aplicadas.

### MÉDIA — arquitetura e coesão

**M1. Duas camadas de dados paralelas.**
No servidor, `lib/data` (9 arquivos, Server Components). No cliente, `lib/hooks` (23 hooks React Query consultando o Supabase direto;
`use-tournament` sozinho tem 15 `.from()`). Além disso, 42 páginas e componentes chamam `.from()` direto
(`admin/estatisticas` 6, `torneios/[slug]/page` 5…). O mesmo dado é buscado de jeitos diferentes:
torneio via `get_tournament_page_data` no servidor e via `use-tournament` no cliente.
O admin inteiro é client-side, o que explica o "Carregando…" eterno no browser sandbox, os flashes e o custo de hidratação.
→ Uma camada de consultas por domínio (`lib/<domínio>/queries.ts`) usada pelos dois lados.
Regra: componente de UI não chama `.from()`. Migrar telas do admin aos poucos para Server Component + Server Actions.

**M2. `lib/` organizada metade por tipo técnico, metade por domínio.**
- `lib/utils` (23 arquivos) virou depósito de regra de negócio. `chess.ts` mistura resultado de partida,
  rótulo/cor de status (UI), desempates, `slugify` e lista de UFs. `round-navigation`, `draft-pairing-state`,
  `standings-state`, `round-results` e `rounds` são domínio de torneio. Já `lib/tournament` só tem TV/pódio.
- Dinheiro em 5 lugares: `lib/asaas`, `lib/finance`, `lib/billing` (novo), `lib/data/billing.ts`, `lib/data/entitlements.ts`.
- Notificações em 4: `lib/push.ts`, `lib/tournament-notifications.ts`, `lib/import/notify.ts` e
  `app/api/internal/notify-round/route.ts` (445 linhas de regra dentro de rota).

→ Organizar por domínio (`lib/tournament/{status,rounds,standings,tv}`, `lib/registration`, `lib/billing`, `lib/notifications`).
`utils` fica só com o genérico (`cn`, `date`, `text`).

**M3. Autorização copiada rota a rota.**
35 rotas fazem `auth.getUser()` à mão e 20 buscam `user_profiles.role` à mão. As mensagens e os códigos 401/403 variam,
e não existe `requireAdmin` / `requireTournamentManager`. Só 2 das 58 rotas validam entrada com zod (já é dependência).
Segredo do cron comparado com `!==` (sem `timingSafeEqual`).
→ `lib/api/guards.ts` com `requireUser`, `requireAdmin`, `requireTournamentManager(slug)` e `requireCronSecret`;
schema zod por rota. Esquecer a checagem numa rota nova deixa de ser possível.

**M4. Componentes gigantes.**
`native-rounds.tsx` (968 linhas), `classification-setup.tsx` (839), `tournament-form.tsx` (701), `admin/torneios/[slug]/jogadores/page.tsx` (590).
Misturam busca, regra e tela. → Extrair hooks e subcomponentes por seção; regra para `lib/`.

**M5. i18n pela metade.**
A árvore inteira está sob `app/[locale]` com `en`/`es`, middleware e redirects, mas só 3 de 207 `.tsx` usam `next-intl`
(mensagens com ~650 bytes por idioma). `/en/...` e `/es/...` servem português: complexidade de rota sem ganho,
e conteúdo idêntico em 3 URLs (SEO). O comentário do `next.config.js` ("DORMENTE enquanto o segmento não existir") está desatualizado.
→ Decidir: completar a tradução, ou desligar `en`/`es` até haver demanda.

**M6. Regra de negócio espalhada entre repositórios.**
O `cron-import` escreve direto em `standings`, `tournament_players` e `pairings`, sem os tipos gerados (`supabase-js` sem `Database`).
Regras como sincronizar pontos, status efetivo e link da fonte vivem em 3 lugares (RPC, site e robô).
→ O robô passa a chamar RPCs de aplicação (ex.: `import_apply_snapshot(jsonb)`), ou ao menos copia `database.generated.ts` no build.

**M7. Um banco, quatro produtos, um schema.**
`public` guarda o Gambito, o Gambito Lite (`lite_*`), o Chess Sparring (`sparring_*`) e o Chess Match Film (`broadcast_*`).
Tipos gerados, advisors, migrations e policies ficam misturados, e uma migration de um app pode quebrar outro.
→ Schemas próprios (`sparring`, `broadcast`) expostos ao PostgREST, ou no mínimo dono documentado e migrations separadas.

### BAIXA — boas práticas e higiene

- **Vitest sem alias `@/`**, o que obriga os testes a usar import relativo. Basta `resolve.alias` no `vitest.config.ts`.
- **e2e roda só em PR, mas o fluxo publica direto na `main`**: na prática o e2e não roda.
- **Dependências**:
  - `xlsx@0.18.5` vem do npm, que a SheetJS abandonou, e tem CVEs conhecidos (prototype pollution, ReDoS).
    É usado em `import-players`, que processa planilha **enviada pelo usuário**. Trocar pelo tarball oficial da SheetJS (0.20.x) ou `exceljs`.
  - `next-pwa` está instalado mas desligado: remover.
  - `@google/genai` está sem uso em produção.
  - `eslint-config-next` 15.1.6 com `next` 15.5: alinhar.
- **`ignoreBuildErrors: true`** é aceitável só enquanto o CI for a barreira; manter `type-check` obrigatório.
- **CLAUDE.md com 73 KB**: mistura regra permanente com diário (~40 entradas de "erros já cometidos").
  Custa contexto em toda sessão e esconde a regra. Mover o histórico para `docs/decisoes/` (ADR) e deixar o CLAUDE.md com menos de 15 KB.
- **Lixo de trabalho**: cerca de 30 `scratch-*.mts` / `apply-*.mjs` soltos na raiz do `cron-import`;
  `.xlsx`, `.png` e `read_excel.js` soltos nas raízes. Não estão versionados, mas confundem.
  As chaves (`gcp-sa-key.json`, `*.jks`) estão corretamente fora do git.

## 3. Estrutura de dados

| Ponto | Situação | Recomendação |
|---|---|---|
| `tournaments` com 50 colunas | Junta identidade, regras de pareamento, inscrição/pagamento, check-in, transmissão e classificação | Separar em tabelas 1:1 por assunto (`tournament_registration_settings`, `tournament_checkin`…) conforme forem mexidas |
| `tournament_registrations` com 38 colunas | Dados pessoais + cobrança Asaas + fila + conciliação na mesma linha; só cabe 1 tentativa de cobrança | `registration_payments` (1:N) com histórico de cobranças |
| CPF em texto puro em 2 tabelas | `user_profiles.cpf_cnpj` e `tournament_registrations.cpf_cnpj`; público com muitos menores (LGPD) | Guardar só onde a cobrança exige; mascarar na leitura; prazo de retenção |
| Cópia `standings` → `tournament_players` | Documentada, mas `direct_encounter` e `performance_rating` nunca foram usadas | Remover as 2 colunas; no longo prazo, ler `standings` por view/RPC e acabar com a cópia |
| `game_result` + `is_bye` + `bye_kind` | O enum mistura resultado com estado de emparceiramento (`bye`, `not_paired`), com 3 campos dizendo a mesma coisa (hoje 0 linhas incoerentes) | `CHECK` garantindo a coerência; documentar qual campo manda |
| Status salvo e derivado | `tournament_status` (`registration`/`registration_closed`) + `registration_closes_by_date` + `effective_status` corrigido na leitura | Uma função única de status; a coluna guarda só a intenção do organizador |
| `user_role` com `organizer`/`arbiter` | Ninguém usa (as flags `is_organizer`/`is_arbiter` substituíram) | Remover os valores ou trocar por `is_admin boolean` |
| "Seguir jogador" em 4 modelos | Tabela `player_follows` + arrays `followed_player_ids` em `push_subscriptions`, `site_devices` e `app_push_follows` (sem FK, ids órfãos possíveis) | Uma tabela `follows(device_or_user, player_id)` com FK |
| Três canais de push | `push_subscriptions` (web), `app_push_tokens` (app), `admin_fcm_tokens` (admin) | Uma tabela `push_endpoints(kind, …)` |
| Cadastro de jogador | 9.233 jogadores: 1.640 sem FIDE nem CBX, 185 nomes repetidos, 362 `is_test` em produção | Ferramenta de mesclagem, nome normalizado indexado, dados de teste fora da produção |
| 39 FKs sem índice | A maioria é irrelevante (`created_by`…). As que pesam: `standings.tournament_player_id` (join do sync), `tournament_registrations.{player_id, tournament_player_id, category_id, pairing_group_id}`, `tournament_players.category_id`, `report_orders.*`, `series_points_awarded.*` | Criar só essas |
| Ao vivo × arquivo | `pairings` (29,6k) e `history_games` (55k) são dois modelos de partida, unidos à mão nas funções de histórico | View `player_games` unificada para leitura |
| Status: enum × `text + CHECK` | 16 enums e 33 checks, sem critério | Convenção: `text + CHECK` para o que muda com frequência |

## 4. Ordem sugerida

1. A1 (cascata financeira) e A3 (sync sem mudança): migrations pequenas, risco baixo, ganho alto.
2. A2 (RLS initplan) e os índices de FK que pesam: uma migration, sem mudar comportamento.
3. A4: tirar o WIP do limbo.
4. M3 (guards de API + zod) e a troca do `xlsx`.
5. Contínuo, ao mexer em cada tela: M1, M2, M4 e a separação de `tournaments` / `tournament_registrations`.
6. Decisões de produto: M5 (i18n) e M7 (schemas por produto).
