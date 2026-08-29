# Fonte da verdade — onde cada regra mora

Esta skill porta lógica de dois repos: `xadrez-br` (este) e `../xadrez-br-cron` (repo irmão,
worker de import). Se o comportamento real divergir do que está descrito aqui ou no
`SKILL.md`, **confie no código-fonte, não neste documento** — ele pode ter sido atualizado
depois que esta skill foi escrita.

## `../xadrez-br-cron/src/` (worker `cron-import`, TypeScript + supabase-js)

| Arquivo | O que define | Por que importa pra essa skill |
|---|---|---|
| `chess-results.ts` | `parseBaseUrl` (extrai tnr/lan/SNode da URL), `buildArtUrl` (monta URL pra cada `art=`), `fetchExcelDirect` (baixa o `.xlsx` de qualquer página anexando `prt=4&excel=2010`, preservando `SNode`), `extractMaxRound`/`extractRoundCountFromHeading` (descobre quantas rodadas já foram publicadas) | Base de `scripts/parse-chess-results.mjs` inteiro — os nomes de função são os mesmos de propósito |
| `normalize.ts` | `normalize` (remove acento/caixa), `normalizeNameKey` (nome com palavras ordenadas alfabeticamente — cancela inversão "Sobrenome, Nome" vs "Nome, Sobrenome" entre a planilha de jogadores e a de pareamentos), `colIndex` | Usado em `import-players.ts` e `import-pairings.ts`; portado 1:1 no script |
| `import-players.ts` | `parseRows` (layout da planilha de inscritos: colunas Nº./Nome/ID FIDE/EloN/Tipo/Clube-Cidade), e a lógica de find-or-create em `players` + homônimo-em-outro-grupo + remoção de quem saiu | O parsing está portado no script (`cmdPlayers`); a lógica de find-or-create/homônimo/remoção **não** está totalmente portada nos templates SQL — ver "Limitações" no `SKILL.md` |
| `import-pairings.ts` | `parseExcel` (detecção de "X. Ronda" no cabeçalho, colunas Resultado/White/Black/Nº., `parseResult` incluindo W.O. `"- - +"`/`"+ - -"`/`"- - -"` e bye), find-or-create de `rounds`, matching de jogador por `normalizeNameKey` com fallback por Nº. | Parsing portado (`cmdPairings`); testado ao vivo contra `tnr1449184` (rodada 1, pegou um W.O. de verdade) |
| `import-standings.ts` | `parseExcel` (colunas Nome/Pts./Nº/Desp1-3), upsert em `standings` por `initial_ranking`, fecha rodadas `ongoing→finished` quando a rodada completou | Parsing portado (`cmdStandings`); testado ao vivo contra `tnr1449184` |
| `process-tournament.ts` | Orquestra os 4 acima nessa ordem: players → descobre maxRound (art=1 + art=2) → pairings 1..maxRound → standings; bloqueia torneio `mode='native'`; monta a mensagem final (`"jogadores: X · rodadas 1..N: Y pareamentos · classificação: Z jogadores"`) | Ordem e formato de mensagem que o Passo 5 do `SKILL.md` deve seguir |
| `README.md` | Descreve o Cloud Run Job + Cloud Scheduler (agendado a cada 2 min) | **Não confie cegamente nisso** — documenta o desenho, não garante que está rodando agora. Sempre confira `max(tournament_imports.last_run_at)` antes de assumir que vai ser pego automaticamente |

## Este repo (`xadrez-br`)

| Arquivo | O que define | Por que importa |
|---|---|---|
| `app/api/admin/chess-results-preview/route.ts` | Parsing de metadados (nome/cidade/data/árbitro/organizador/ritmo) da página `art=0` via cheerio, com tabela de rótulos pt/en/de | Base do subcomando `info` do script — mas com alguns rótulos a mais descobertos por essa skill (ver comentários no `.mjs`) que valeria portar de volta pra esse arquivo num PR separado, se algum dia for pedido |
| `app/admin/tournaments/new/from-chess-results/page.tsx` | Fluxo da UI equivalente (preview → form → cria `tournaments`+`tournament_imports`) | O que essa skill substitui — mesmos dois inserts, na mão |
| `app/admin/tournaments/[slug]/imports/page.tsx` | Como o painel exibe `tournament_imports` (badge por `last_status`/`last_message`/`last_run_at`) | Formato esperado do `last_message` que o Passo 5 do `SKILL.md` deve preencher |
| `scripts/import-festival-crianca-dourados.mjs` | Precedente já existente de script one-off pra criar torneio `mode='imported'` com múltiplos grupos (`pairing_group_name` por divisão), usando `pg` direto | Padrão do Passo 3 do `SKILL.md` — adapte pra `execute_sql` quando não houver `.env.local` |
| `lib/utils/chess.ts` | `slugify` | Slug do torneio criado no Passo 3 |
| `supabase/migrations/015_players_sex_and_group_enforcement.sql` | Trigger `enforce_native_pairing_group` — só exige `pairing_group_id` quando `tournaments.mode='native'` | Por isso é seguro deixar `pairing_group_id = null` em `tournament_players`/`rounds` pra torneio importado de grupo único |

## Schema relevante (colunas que os templates SQL usam)

`tournaments`, `tournament_imports`, `players`, `tournament_players`, `tournament_categories`,
`pairing_groups`, `rounds`, `pairings`, `standings` — todos em `public`. Se precisar conferir
uma coluna que não está nos templates, rode `mcp__Supabase__list_tables` com `verbose: true`
em vez de adivinhar.
