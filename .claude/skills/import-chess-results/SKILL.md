---
name: import-chess-results
description: Importa um torneio do chess-results.com pro chess-viewer direto pelo agente, sem passar pela tela /admin/tournaments/new/from-chess-results — cria o torneio (mode='imported'), configura tournament_imports e, se o worker automático cron-import não estiver rodando, faz o import (jogadores, pareamentos, classificação) na mão via SQL, replicando fielmente a lógica do worker real. Use sempre que o usuário colar uma URL do chess-results.com (padrão tnr<id>.aspx) e pedir pra importar/puxar/sincronizar o torneio, ou pedir "cria um torneio importado" / "importa esse torneio pelo agente" / "importa via chess-results" sem passar pelo painel.
---

# Importar torneio do chess-results.com pelo agente

## Por que essa skill existe

A UI (`/admin/tournaments/new/from-chess-results`, exclusiva de admin) já faz isso, mas o
pedido aqui é fazer via agente: sem clicar em nada. Isso significa reproduzir manualmente o
que a UI faz (criar as duas linhas no banco) **e**, frequentemente, o que o worker
`cron-import` faz depois (puxar jogadores/pareamentos/classificação do chess-results) — porque
esse worker roda como **Cloud Run Job agendado no GCP**, fora deste sandbox, e nada garante
que ele esteja de fato ativo agora (documentado só dizer "a cada 2 minutos" no README não é
prova — numa sessão real, a última execução registrada estava **10 dias** atrasada).

## Antes de tudo: acesso ao banco

Prefira `mcp__Supabase__execute_sql` (ferramenta MCP do Supabase) em vez de `pg`/`SUPABASE_DB_URL`.
Motivo: em sessão remota normalmente **não existe** `.env.local` no sandbox (é gitignored e não
é clonado); o MCP já vem com acesso privilegiado ao projeto certo sem precisar de segredo nenhum.

1. Confirme o `project_id` com `mcp__Supabase__list_projects` — procure o projeto **"Chess
   Viewer"** (não hardcode o id cegamente, ele pode mudar; na sessão em que esta skill foi
   escrita era `qpgaoydgzyybakoaagzb`, `status: ACTIVE_HEALTHY`).
2. Se por acaso HOUVER `.env.local` com `SUPABASE_DB_URL` no sandbox, ou o usuário fornecer
   `SUPABASE_SERVICE_ROLE_KEY`, isso abre uma opção melhor pro passo de import manual — ver
   "Passo 4" abaixo.

## Passo 1 — Preview (extrair metadados da URL)

Rode:
```
node .claude/skills/import-chess-results/scripts/parse-chess-results.mjs info "<url que o usuário passou>"
```
Isso devolve `{name, city, state, startDate, endDate, roundsCount, chiefArbiter, organizerName,
timeControl, venue}`. É a mesma lógica de `app/api/admin/chess-results-preview/route.ts` deste
repo (rótulos em pt/en/de, tabela label→valor), com alguns ajustes que essa skill descobriu
faltando nesse arquivo original ao testar contra um torneio real (ver comentários no próprio
script `.mjs`: rótulo "Data" isolado em vez de "Data Início" formatado `yyyy/mm/dd`, "Árbitro
Principal" em vez de "árbitro-chefe", "Tempo de reflexão" em vez de "Ritmo", e uma `<tr>`
"âncora" da própria página cujo texto concatenado engolia o organizerName). Se algum campo
sair estranho pra um torneio novo, é provável que seja mais uma variante de rótulo — dá pra
adicionar ao array `LABELS` do script, mesma ideia.

Alguns campos podem vir vazios (o chess-results não é uniforme) — preencha o que faltar
perguntando ao usuário ou deixando em branco (o form da UI também permite isso). `state` só
sai preenchido quando o campo "Local" termina em "CIDADE UF"; senão pergunte ou deixe vazio.

## Passo 2 — Checar duplicidade

Antes de criar qualquer coisa:
```sql
select id, tournament_id, base_url from tournament_imports where base_url ilike '%<tnr-id>%';
```
Se já existir uma linha pra essa URL, pare e avise o usuário — não duplique o torneio.

## Passo 3 — Criar tournament + tournament_imports

Via `execute_sql`, numa transação (`begin; ... commit;`), inserindo em `tournaments`
(`mode='imported'`, `slug = slugify(nome) + '-' + data sem hífen`, `created_by` = uid do
usuário que pediu, resolvido por email em `user_profiles`/`auth.users`) e em
`tournament_imports` (`base_url`, `pairing_group_name` = `null` pra torneio de grupo único,
`enabled = true`). O script `scripts/import-festival-crianca-dourados.mjs` deste repo é o
precedente já estabelecido desse padrão (usa `pg` direto porque tinha `.env.local`
disponível — adapte pra `execute_sql` quando não tiver). Slugify: minúsculo, NFD sem acento,
troca não-alfanumérico por `-`, colapsa hífens repetidos (ver `lib/utils/chess.ts`).

Torneio com múltiplos grupos (várias URLs, uma por `SNode`)? Crie **um único** `tournaments` e
**uma linha de `tournament_imports` por grupo**, com `pairing_group_name` preenchido (nome da
divisão) — mesmo padrão do script de precedente citado acima.

## Passo 4 — O worker automático está ativo?

```sql
select max(last_run_at) from tournament_imports;
```
- **Recente (minutos atrás):** o Cloud Scheduler está rodando de verdade. Pode só aguardar
  (não precisa ficar em loop apertado; um `ScheduleWakeup`/checagem depois de alguns minutos
  basta) e conferir `last_status`/`last_message` da linha nova depois.
- **Antigo (mais de ~15 min) ou nulo:** não adianta esperar — vá pro Passo 5.

**Sempre prefira rodar o worker real antes de reimplementar a lógica na mão.** Se o usuário
tiver a `SUPABASE_SERVICE_ROLE_KEY` à mão, ou existir `.env.local` com `SUPABASE_DB_URL` no
sandbox:
```sh
cd ../xadrez-br-cron   # (ou ../cron-import, nome antigo — confira qual existe)
cp .env.example .env   # preencha SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run dev            # processa TODAS as linhas enabled=true, inclusive a que você acabou de criar
```
Isso usa a lógica testada e cobre casos que o Passo 5 abaixo **não** cobre (ver limitações).
Só caia pro import manual (Passo 5) quando não houver credencial disponível **e** o scheduler
não estiver ativo — é o caso mais comum numa sessão remota, mas pergunte/ofereça a opção A
antes de assumir isso.

## Passo 5 — Import manual via SQL (sem credencial, worker parado)

Isso reimplementa em SQL o que `../xadrez-br-cron/src/{chess-results,import-players,
import-pairings,import-standings}.ts` fazem via `supabase-js`. **Esses arquivos TypeScript são
a fonte da verdade** — se algo aqui divergir deles (o worker mudou depois que esta skill foi
escrita), confie no `.ts`, não neste documento. Leia `references/source-files.md` pra saber
qual arquivo cobre qual regra antes de inventar uma variação.

**Antes de mais nada, cheque que o torneio não é `mode='native'`** — o worker real recusa
importar torneio nativo (`process-tournament.ts`, "torneio nativo — importação bloqueada")
porque isso sobrescreveria pareamentos gerados pela engine de verdade. Nunca pule esse check.

### 5.1 — Buscar e parsear os dados (sem tocar no banco)

Use `scripts/parse-chess-results.mjs` (já testado nesta sessão contra torneio real, incluindo
caso com W.O. e bye):
```
node scripts/parse-chess-results.mjs players   "<baseUrl>"                  # lista de inscritos
node scripts/parse-chess-results.mjs rounds    "<baseUrl>"                  # quantas rodadas publicadas (0 = torneio ainda não começou)
node scripts/parse-chess-results.mjs pairings  "<baseUrl>" <roundNumber>    # uma por rodada, 1..maxRound
node scripts/parse-chess-results.mjs standings "<baseUrl>"                  # classificação final/parcial
```
Rode com cwd na raiz do repo `xadrez-br` (o script resolve `xlsx` a partir do repo irmão
`../xadrez-br-cron/node_modules`, e `cheerio` do próprio `node_modules` do xadrez-br). Se
`rounds` devolver `0`, não tem pareamento pra importar ainda — só jogadores mesmo (foi
exatamente o caso na sessão em que esta skill nasceu: torneio cadastrado mas ainda não
começou). Repita o import mais tarde quando o organizador publicar a 1ª rodada no
chess-results.

### 5.2 — Escrever no banco

`execute_sql` não aceita bind params — os dados viram um literal `jsonb` embutido na própria
query, dentro de um bloco `do $$ ... $$` em plpgsql que faz o find-or-create. Os templates
prontos (jogadores+categorias, pareamentos, classificação) estão em
`references/sql-templates.md` — copie, cole os dados parseados no lugar do array jsonb, ajuste
o `v_tournament_id`, rode. Sempre feche cada bloco com um `select` de conferência (contagem +
amostra) logo depois, pra você mesmo validar antes de reportar sucesso.

Ao final, grave em `tournament_imports` (`last_run_at = now()`, `last_status = 'success'` ou
`'error'`, `last_message` no MESMO formato que o worker real grava — ver o final de
`process-tournament.ts`, algo como `"jogadores: N · rodadas 1..M: P pareamentos ·
classificação: C jogadores"`) — a tela `/admin/tournaments/[slug]/imports` lê esse campo, e um
formato diferente do que ela espera não quebra a tela, mas confunde quem for ler depois.

## Limitações conhecidas do import manual (Passo 5) — leia antes de reexecutar

A lógica dos templates em `references/sql-templates.md` foi validada só pro caso **torneio
novo, sem `tournament_players` prévios, grupo único**. O worker real (`import-players.ts`) tem
lógica adicional pra dois casos que os templates **não** cobrem:

1. **Reexecução** (torneio já importado antes, rodando de novo pra pegar rodada nova): o
   worker casa por nome tolerante à ordem das palavras contra quem já está no grupo, e
   remove quem saiu da planilha. Os templates aqui vão tentar recriar/duplicar em vez de
   atualizar. Se o torneio já tiver `tournament_players`, ou prefira o Passo 4 opção A
   (worker real, que é idempotente), ou avise o usuário do risco antes de prosseguir.
2. **Múltiplos grupos no mesmo torneio** (festival com várias divisões/SNode): o worker trata
   homônimo-em-outro-grupo como pessoa diferente (ver comentário longo em
   `import-players.ts` sobre o caso do Festival da Criança). Os templates aqui não têm essa
   guarda — rodar pra um torneio multi-grupo sem adaptar arrisca casar duas pessoas
   diferentes como se fossem uma só.

Se cair em qualquer um dos dois casos acima, pare e avise o usuário em vez de seguir com os
templates como estão — ou adapte a lógica lendo `import-players.ts` linhas ~100-260 primeiro.

## Depois de importar

Sempre finalize com uma conferência via `execute_sql` (contagens de `tournament_players`,
`rounds`, `pairings`, `standings` pro `tournament_id`) antes de reportar sucesso ao usuário —
não confie cegamente no fato de a query não ter dado erro. Se `rounds` = 0, deixe claro pro
usuário que só os jogadores entraram e que será preciso reimportar quando a 1ª rodada sair.
