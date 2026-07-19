# Design Técnico — Torneios Nativos (Sistema Suíço)

> Desenho técnico da fase "torneios nativos", derivado de
> [requisitos-torneios-nativos.md](./requisitos-torneios-nativos.md).
> Elaborado em 2026-07-06. Status: **proposta para revisão**.

---

## 1. Visão de arquitetura

Nenhum serviço novo é criado. O motor de pareamento roda **dentro do próprio
Next.js** (API route, runtime Node) como módulo WASM. Toda mutação de estado de
torneio passa por **RPCs Postgres** (transacionais, com locks), nunca por
updates diretos do cliente.

```
┌──────────────────────────── Vercel (Next.js) ────────────────────────────┐
│                                                                          │
│  UI admin/árbitro (React)          API routes (Node runtime)             │
│  ┌──────────────────────┐          ┌─────────────────────────────┐       │
│  │ editor de rascunho   │──POST──▶ │ /api/admin/.../rounds/       │       │
│  │ painel de resultados │          │   generate                   │       │
│  │ gestão de staff      │          │  1. auth (staff)             │       │
│  └──────────────────────┘          │  2. carrega estado do grupo  │       │
│                                    │  3. serializa TRF(bx) ───┐   │       │
│                                    │  4. bbpPairings.wasm ◀───┘   │       │
│                                    │  5. parseia saída            │       │
│                                    │  6. rpc save_round_draft ──────────┐ │
│                                    └─────────────────────────────┘      │ │
└──────────────────────────────────────────────────────────────────────── │ ┘
                                                                          ▼
┌────────────────────────────── Supabase ──────────────────────────────────┐
│  RLS (staff-aware)  +  RPCs transacionais:                               │
│  save_round_draft · publish_round · finish_round · reopen_round          │
│  set_pairing_result · approve_registration · generate_initial_ranking    │
│  recalculate_standings (existente, estendida)                            │
└───────────────────────────────────────────────────────────────────────────┘
                     ▲
                     │ (somente torneios mode='imported')
┌────────────────────┴────────┐
│ cron-import (Cloud Run Job) │  ← inalterado, ganha guarda de modo
└─────────────────────────────┘
```

Princípios:

1. **RPC como única porta de mutação de estado estrutural.** Transições de
   rodada, gravação de rascunho e lançamento de resultado são funções SQL
   `security definer` com validações e `pg_advisory_xact_lock` — o cliente
   nunca faz `UPDATE rounds SET status` direto (o admin atual faz isso e será
   migrado).
2. **TRF(bx) como formato pivô.** O mesmo serializador alimenta a engine e a
   exportação FIDE (RF-9).
3. **A engine é stateless e efêmera**: instanciada por requisição, recebe
   texto, devolve texto. Sem estado compartilhado, sem risco de concorrência
   no WASM.

---

## 2. Fatos verificados sobre o bbpPairings (2026-07-06)

Fonte: repositório `BieremaBoyzProgramming/bbpPairings` (branch `master`) e
manual JaVaFo AUM (a interface do bbpPairings segue o JaVaFo, com divergências
documentadas no README).

| Aspecto | Fato |
|---|---|
| Licença | **Apache 2.0** — compatível com uso comercial; preservar notices no repo |
| Linguagem/build | C++20, GCC/Clang, Makefile próprio |
| CLI | `bbpPairings --dutch input.trf -p [output]` · `-c` valida torneio · `-l` checklist |
| Exit codes | `0` sucesso · `1` **não existe pareamento válido** · `2` erro inesperado · `3` request/entrada inválida · `4` limite de tamanho · `5` erro de arquivo |
| Limites (defines) | `MAX_PLAYERS` 9999 · `MAX_ROUNDS` 99 · `MAX_POINTS` 99.9 — suficientes |
| Defines úteis p/ WASM | `OMIT_BURSTEIN`, `OMIT_GENERATOR`, `OMIT_CHECKER` reduzem o binário (Dutch-only) |
| `XXR n` | **Obrigatório** — total de rodadas do torneio |
| `XXC white1\|black1` | **Obrigatório no bbpPairings** (não sorteia cor; JaVaFo sorteava) — a cor do nº 1 na rodada 1 vem de configuração |
| `BBW/BBD/BBL/BBZ/BBF/BBU pp.p` | Valores de pontuação: vitória, empate, derrota, bye zero, W.O., bye de pareamento. Ex.: `BBW  3.0` |
| `XXA` | Aceleração — **fora de escopo** (decisão fechada) |
| Rodada a parear | Inferida das colunas de rodada preenchidas nas linhas `001`; o campo points é **validado** contra os resultados + valores BB* (estrito) |
| Ausências na rodada a parear | Coluna extra `0000 - Z` (zero), `0000 - H` (bye de ½), `0000 - F` (bye de 1 ponto); pontos devem incluir o bye |
| Saída `-p` | 1ª linha = nº de pares; linhas seguintes = `startno_branco startno_preto`; bye = `startno 0` |

Assunções a validar no spike (seção 12): a 1ª coluna da saída é o jogador de
brancas; a ordem das linhas corresponde à ordem de mesas.

---

## 3. Modelo de dados

### 3.1 Convenções

- Migrations numeradas a partir de **012** (corrigir antes a colisão existente:
  há duas migrations `011_*`; renomear `011_recalculate_standings_use_result.sql`
  para `012_...` ou adotar timestamp — recomendo migrar a numeração para
  timestamp `YYYYMMDDHHMM_nome.sql` daqui em diante).
- Nada é removido do schema nesta fase; colunas legadas ficam até a migração
  de dados terminar.

### 3.2 Migration A — modo do torneio e configuração nativa

```sql
create type tournament_mode as enum ('native', 'imported');
create type initial_color  as enum ('white1', 'black1');
create type rating_kind    as enum ('std', 'rpd', 'blz');

alter table tournaments
  add column mode                 tournament_mode not null default 'imported',
  add column requested_bye_score  numeric(2,1) not null default 0.5
             check (requested_bye_score in (0.0, 0.5)),   -- RF: configurável por torneio
  add column initial_color        initial_color not null default 'white1',
  add column rating_kind          rating_kind not null default 'std',
  add column tiebreak_order       text[] not null
             default '{buchholz,buchholz_cut1,sonneborn_berger}';

-- Torneios novos criados pela UI nativa usam 'native';
-- todos os existentes permanecem 'imported' (default).
```

Notas:
- `rating_kind` é sugerido a partir de `time_control` no formulário de criação
  (heurística: `G/x` com x<10 → blz; x<60 → rpd; senão std), mas fica
  **explícito e editável** — é ele que define o rating de seed e o campo
  rating do TRF.
- `initial_color` registra o sorteio físico da cor do nº 1 (exigência do
  bbpPairings).
- `tiebreak_order`: valores permitidos validados por trigger/check —
  `buchholz`, `buchholz_cut1`, `sonneborn_berger`, `wins`, `progressive`.

### 3.3 Migration B — consolidação grupos × categorias (RF-2)

> **EMENDA (2026-07-19, implementação da F1):** o NOT NULL global em
> `pairing_group_id` foi substituído por **trigger que exige grupo apenas em
> torneios `mode='native'`** (`enforce_native_pairing_group`, migration 015).
> Motivos descobertos na implementação: (1) o cron-import insere
> `tournament_players`/`rounds` com grupo NULL em importados de grupo único —
> NOT NULL global quebraria o worker antes da F11; (2) backfill de grupo
> "Único" em torneios importados mudaria a UI pública deles (cards de grupo
> passariam a aparecer). Consequências: o backfill do bloco abaixo não foi
> executado, o índice parcial `rounds_unique_no_group` (007) permanece, e o
> caso "partição NULL" do `recalculate_standings` (010) continua necessário
> para importados. Para nativos, a semântica do design vale integralmente.
> F1 aplicada nas migrations 013–015 (numeração sequencial mantida; a
> sugestão de timestamps da §3.1 não foi adotada — o fluxo de aplicação é
> manual/roteirizado e a ordenação numérica basta).

```sql
-- 1. Sexo do jogador (exigido pelo TRF e pela categoria Feminino)
alter table players add column sex char(1) check (sex in ('m','w'));

-- 2. Grupo obrigatório para torneios nativos.
--    Backfill: cria grupo "Único" para todo torneio sem grupos e
--    aponta tp/rounds órfãos para ele.
insert into pairing_groups (tournament_id, name, sort_order)
select t.id, 'Único', 0
from tournaments t
where not exists (select 1 from pairing_groups pg where pg.tournament_id = t.id);

update tournament_players tp set pairing_group_id = (
  select pg.id from pairing_groups pg
  where pg.tournament_id = tp.tournament_id
  order by pg.sort_order limit 1
) where tp.pairing_group_id is null;

update rounds r set pairing_group_id = ( ...idem... )
  where r.pairing_group_id is null;

-- 3. A partir daqui, NOT NULL de fato (o índice parcial
--    rounds_unique_no_group da migration 007 morre junto):
alter table tournament_players alter column pairing_group_id set not null;
alter table rounds             alter column pairing_group_id set not null;
drop index if exists rounds_unique_no_group;

-- 4. Categorias viram recorte de premiação: o link estrutural permanece
--    apenas como escopo opcional. Documentar em comentário SQL:
comment on column tournament_categories.pairing_group_id is
  'Escopo opcional da premiação (categoria vale dentro deste grupo). NÃO define pareamento.';

-- 5. Rodadas por grupo podem divergir do torneio (ex.: Sub-8 com 5 rodadas
--    num evento de 7):
alter table pairing_groups
  add column rounds_count smallint;  -- null = herda tournaments.rounds_count
```

Consequência importante do backfill: o `recalculate_standings` (010) perde o
caso "partição NULL" — simplifica, não quebra.

Cautela no backfill: em torneio importado **multi-grupo**, um `tp` com grupo
NULL seria jogado no primeiro grupo por `sort_order` — antes de rodar, validar
com `select` que só torneios de grupo único têm `tp` órfãos (esperado, pois o
cron-import sempre preenche o grupo em multi-grupo).

### 3.4 Migration C — ciclo de vida de rodada e pareamentos

```sql
-- Novo estado 'draft' (rascunho invisível ao público).
-- Mapeamento semântico: draft → ongoing(=publicada) → finished.
-- 'pending' fica reservado ao fluxo importado/legado.
alter type round_status add value 'draft' before 'pending';

create type bye_kind as enum (
  'pairing',        -- bye automático da engine (BBU, TRF 'U')
  'requested_half', -- bye solicitado, ½ ponto (TRF 'H')
  'requested_zero', -- bye solicitado / ausência, 0 pontos (TRF 'Z')
  'late_entry'      -- rodadas anteriores à entrada tardia (TRF 'Z' ou 'H')
);

alter table pairings
  add column bye_kind        bye_kind,     -- null quando não é bye
  add column manual_override boolean not null default false;  -- mesa alterada à mão

-- Unicidade de mesa e de jogador por rodada (integridade que hoje não existe):
create unique index pairings_unique_board on pairings (round_id, board_number)
  where board_number is not null;
create unique index pairings_unique_white on pairings (round_id, white_tp_id);
create unique index pairings_unique_black on pairings (round_id, black_tp_id)
  where black_tp_id is not null;

-- Entrada tardia (RF-3): a partir de qual rodada o jogador participa.
alter table tournament_players
  add column joined_at_round smallint not null default 1;
```

### 3.5 Migration D — byes solicitados

```sql
create table requested_byes (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  tp_id          uuid not null references tournament_players(id) on delete cascade,
  round_number   smallint not null,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (tp_id, round_number)
);
```

- Registrado pelo árbitro **antes** de gerar o rascunho da rodada.
- A pontuação não fica aqui: é resolvida na geração usando
  `tournaments.requested_bye_score` (vira uma linha em `pairings` com
  `is_bye=true`, `bye_kind='requested_half'|'requested_zero'` e pontos
  correspondentes).
- Gerar rascunho com bye solicitado para rodada já publicada → erro de
  validação.

### 3.6 Migration E — staff e permissões (RNF)

```sql
create type staff_role as enum ('organizer', 'arbiter');

create table tournament_staff (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           staff_role not null,
  invited_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (tournament_id, user_id)
);

-- Já existe (002) o helper is_tournament_manager(p_tournament_id), usado por
-- TODAS as policies de gestão (rounds_manage, pairings_manage, ...). Em vez de
-- criar um helper paralelo, ESTENDÊ-LO para incluir staff — todas as policies
-- existentes ficam staff-aware sem reescrita:
create or replace function is_tournament_manager(p_tournament_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id and s.user_id = auth.uid()
  );
$$;

-- Nível organizador (config, staff, inscrições) — usado pelas RPCs e por
-- policies novas que exigem mais que árbitro:
create function is_tournament_organizer(p_tournament_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.tournaments
    where id = p_tournament_id
      and (created_by = auth.uid() or auth_user_role() = 'admin')
  ) or exists (
    select 1 from public.tournament_staff s
    where s.tournament_id = p_tournament_id
      and s.user_id = auth.uid() and s.role = 'organizer'
  );
$$;
```

Matriz de permissão:

| Ação | owner (`created_by`) | organizer | arbiter |
|---|---|---|---|
| Editar torneio, staff, grupos, config | ✅ | ✅ | ❌ |
| Gerar/ajustar/publicar/fechar rodada | ✅ | ✅ | ✅ |
| Lançar/corrigir resultado | ✅ | ✅ | ✅ |
| Aprovar inscrições | ✅ | ✅ | ❌ |
| Excluir torneio | ✅ | ❌ | ❌ |

Com o helper estendido, as policies baseadas em `is_tournament_manager`
(`rounds_manage`, `pairings_manage`, etc.) não precisam de mudança. Ajustes
pontuais: `tournaments` (update → organizer), `tournament_registrations`
(hoje compara `created_by` direto → trocar por `is_tournament_organizer`),
`pairing_groups` (**corrigir a migration 006**: usa `t.organizer_id`, coluna
inexistente — tarefa já aberta; as policies corrigidas passam a usar
`is_tournament_organizer`), e as policies das tabelas novas
(`requested_byes`, `tournament_staff`, `audit_log`).

Restrição do árbitro a "somente resultados" **não** é feita por RLS
column-level (frágil) e sim pelo fato de que lançamento de resultado passa
pela RPC `set_pairing_result`, e as transições de rodada validam o papel
internamente.

### 3.7 Migration F — visibilidade de rascunho e auditoria

```sql
-- Público nunca vê rodada draft (defesa em profundidade além do filtro na UI).
-- Recriar as policies existentes rounds_select_public / pairings_select_public
-- (002) acrescentando a exclusão de rascunhos (Postgres não tem
-- CREATE OR REPLACE POLICY — é DROP + CREATE):
drop policy "rounds_select_public" on rounds;
create policy "rounds_select_public" on rounds for select using (
  (status <> 'draft' or is_tournament_manager(tournament_id))
  and exists (
    select 1 from tournaments t
    where t.id = tournament_id
      and (t.is_public or is_tournament_manager(t.id))
  )
);
-- pairings_select_public: idem, com join em rounds para checar r.status

create table audit_log (
  id             bigint generated always as identity primary key,
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  actor          uuid,                    -- auth.uid() capturado na RPC
  action         text not null,           -- 'set_result','swap_pairing','publish_round',...
  entity         text not null,           -- 'pairing','round',...
  entity_id      uuid,
  payload        jsonb,                   -- {before:..., after:...}
  created_at     timestamptz not null default now()
);
create index idx_audit_tournament on audit_log (tournament_id, created_at desc);
-- RLS: staff pode ler; ninguém escreve direto (só RPCs security definer).
```

### 3.8 Ajustes em `tournament_registrations`

```sql
alter table tournament_registrations
  add column sex        char(1) check (sex in ('m','w')),
  add column birth_date date;              -- TRF pede data completa; birth_year continua p/ compat
-- pairing_group_id já existe; a UI de inscrição passa a exigi-lo
-- quando o torneio tem mais de um grupo.
```

---

## 4. Motor de pareamento

### 4.1 Build WASM

Build **fora do CI de deploy** (artefato commitado, reproduzível via script):

```
scripts/build-bbppairings.sh       # roda no container docker.io/emscripten/emsdk
```

```sh
git clone --depth 1 https://github.com/BieremaBoyzProgramming/bbpPairings
em++ -std=c++20 -O2 \
  -DOMIT_BURSTEIN -DOMIT_GENERATOR -DOMIT_CHECKER \
  -DMAX_PLAYERS=2000 -DMAX_ROUNDS=30 \
  src/**/*.cpp \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=node \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 -sALLOW_MEMORY_GROWTH=1 \
  -o lib/pairing/wasm/bbppairings.mjs
```

- O Makefile upstream não serve para Emscripten (flags de link nativo,
  packaging) — compilamos direto com `em++`; a lista exata de fontes e
  eventuais patches são o **produto do spike** (seção 12).
- `OMIT_*` derruba Burstein/gerador/checker → binário menor (estimativa
  500 KB–1,5 MB; validar).
- Artefatos versionados em `lib/pairing/wasm/` (`.mjs` + `.wasm`) com o hash
  do commit upstream registrado em `lib/pairing/wasm/VERSION`.
- `next.config.js`: incluir o `.wasm` no output tracing da rota
  (`outputFileTracingIncludes`) para o bundle da Vercel.

### 4.2 Wrapper TypeScript

```
lib/pairing/
├── wasm/                  # artefatos do build (mjs, wasm, VERSION, LICENSE upstream)
├── engine.ts              # instancia o módulo, roda callMain, mapeia exit codes
├── trf/
│   ├── serialize.ts       # estado do grupo → TRF(bx)
│   ├── parse-output.ts    # saída -p → pares de startno
│   └── constants.ts       # posições de coluna, códigos de resultado
└── service.ts             # orquestra: carregar estado → serializar → engine → mapear
```

```ts
// engine.ts — contrato
export type EngineOk    = { ok: true; pairs: Array<[number, number]> }; // [white, black|0]
export type EngineError = { ok: false; code: 'NO_VALID_PAIRING' | 'INVALID_INPUT'
                                          | 'SIZE_LIMIT' | 'ENGINE_ERROR'; detail: string };

export async function pairRound(trfbx: string): Promise<EngineOk | EngineError> {
  const mod = await createBbpModule();           // nova instância por chamada (sem estado global)
  mod.FS.writeFile('/input.trf', trfbx);
  const exit = mod.callMain(['--dutch', '/input.trf', '-p', '/output.txt']);
  // exit 0 → parse /output.txt ; 1 → NO_VALID_PAIRING ; 3 → INVALID_INPUT ;
  // 4 → SIZE_LIMIT ; 2/5 → ENGINE_ERROR (5 não deveria ocorrer em MEMFS)
}
```

- Instância nova por requisição: elimina qualquer preocupação com estado
  residual; custo de instanciação em Node é de milissegundos e o volume é
  baixíssimo (uma chamada por rodada gerada).
- `NO_VALID_PAIRING` (exit 1) é um **caso de negócio**, não erro técnico:
  ocorre em grupos minúsculos nas rodadas finais (todos já se enfrentaram).
  A UI deve explicar e sugerir reduzir `rounds_count` do grupo.

### 4.3 Serialização TRF(bx)

Uma única função `serializeGroup(state, options)` com dois modos:
`for_pairing` (entrada da engine) e `export` (TRF de homologação, RF-9).

**Layout da linha `001`** (posições 1-based, TRF FIDE):

| Campo | Colunas | Fonte |
|---|---|---|
| Código `001` | 1–3 | fixo |
| Startno | 5–8 | `tp.initial_ranking` (ver 4.4) |
| Sexo | 10 | `players.sex` (fallback `m`) |
| Título | 11–13 | vazio nesta fase |
| Nome | 15–47 | `players.full_name` ("Sobrenome, Nome" quando possível) |
| Rating | 49–52 | `players.rating_{kind}` conforme `tournaments.rating_kind` (0 se null) |
| Federação | 54–56 | `players.federation` |
| ID FIDE | 58–68 | `players.fide_id` (vazio se null) |
| Nascimento | 70–79 | `yyyy/mm/dd`; só com `birth_year` → `yyyy/00/00` |
| Pontos | 81–84 | soma dos pontos **incluindo byes** (`pp.p`) |
| Rank | 86–89 | `standings.rank` (modo export); vazio no modo pairing |
| Rodada r | 92+10·(r−1) | opp (4) · cor (1) · resultado (1) |

**Mapeamento `game_result` → códigos TRF por rodada:**

| `pairings.result` | Linha das brancas | Linha das pretas |
|---|---|---|
| `1-0` | `oppno w 1` | `oppno b 0` |
| `0-1` | `oppno w 0` | `oppno b 1` |
| `1/2-1/2` | `oppno w =` | `oppno b =` |
| `forfeit_white` (brancas W.O.) | `oppno - -` | `oppno - +` |
| `forfeit_black` | `oppno - +` | `oppno - -` |
| `double_forfeit` | `0000 - -` | `0000 - -` (validar no spike) |
| bye `bye_kind='pairing'` | `0000 - U` | — |
| bye `requested_half` | `0000 - H` | — |
| bye `requested_zero` / ausência | `0000 - Z` | — |
| `late_entry` (rodada perdida) | `0000 - Z` (ou `H` conforme config) | — |

**Cabeçalho gerado:**

```
012 <nome do torneio/grupo>
XXR <pairing_groups.rounds_count ?? tournaments.rounds_count>
XXC <tournaments.initial_color>
BBW  1.0        ← apenas se algum valor divergir do padrão FIDE;
BBD  0.5           caso contrário, omitir todas as linhas BB*
```

**Regras do modo `for_pairing`:**

1. Incluir **todos** os `tournament_players` do grupo, inclusive `withdrawn`
   (numeração estável), com o histórico completo das rodadas `finished`.
2. Para a rodada a parear, acrescentar a coluna extra apenas para quem **não
   joga**: `0000 - Z` para `withdrawn` e entradas futuras
   (`joined_at_round > r`), `0000 - H`/`0000 - Z` para bye solicitado
   (conforme `requested_bye_score`). O campo pontos dessas linhas **inclui** o
   bye — a engine valida a consistência (comportamento estrito do
   bbpPairings).
3. Jogadores a parear têm exatamente `r−1` colunas preenchidas.
4. Rodada anterior precisa estar `finished`; resultado `*` em qualquer
   pairing anterior → erro antes de chamar a engine.

**Regras do modo `export`:** todas as rodadas (inclusive a última), campo
rank preenchido, linhas de cabeçalho completas (`012` nome, `022` cidade,
`032` federação, `042/052` datas, `062` nº jogadores, `102` árbitro chefe...).

### 4.4 Numeração estável (startno)

O TRF exige ids `1..N` contíguos **por grupo**. `initial_ranking` passa a ser
essa identidade: gerado uma única vez por `generate_initial_ranking(group_id)`
(ordena por rating do `rating_kind` desc, desempate alfabético), **congelado
na publicação da rodada 1**. Entradas tardias recebem `max+1`. O serializador
falha se houver buracos/duplicatas — integridade imposta por **constraint
trigger que valida unicidade de `(pairing_group_id, initial_ranking)` apenas
em torneios `native`** (dados importados legados não são validados
retroativamente; ver riscos, seção 14).

---

## 5. Ciclo de vida da rodada

### 5.1 Máquina de estados

```
                    generate (API+RPC)
  (não existe) ───────────────────────▶ draft ──── regenerate (substitui) ──▶ draft
                                          │
                                          │ publish_round
                                          ▼
                                       ongoing ◀──────────┐
                                          │               │ reopen_round
                                          │ finish_round  │ (se rodada r+1
                                          ▼               │  não existe)
                                       finished ──────────┘
```

Invariantes (validados nas RPCs, sob advisory lock do grupo):

| Transição | Pré-condições |
|---|---|
| `generate` (r) | grupo do torneio `mode='native'`; rodada r−1 `finished` (ou r=1 com ranking inicial gerado); rodada r não existe ou está `draft`; r ≤ rounds_count do grupo |
| `publish` | rodada `draft`; toda mesa tem nº; nenhum jogador em duas mesas; todos os `active` não-ausentes pareados |
| `finish` | rodada `ongoing`; nenhum resultado `*`; ao concluir → `recalculate_standings` |
| `reopen` | rodada `finished`; rodada r+1 do grupo **não existe** (nem draft) |
| `regenerate` | rodada `draft` — deleta pairings do rascunho e regenera |

Correção de resultado **após** r+1 existir: permitida via `set_pairing_result`
(recalcula pontos/standings, registra auditoria), sem re-parear — regra padrão
de arbitragem, exposta com aviso na UI.

### 5.2 RPCs (SQL, security definer)

```sql
-- Todas começam com:
--   perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 42));
--   e validam is_tournament_manager(...) — ou is_tournament_organizer(...)
--   nas ações de nível organizador (approve_registration, etc.)

save_round_draft(p_group_id uuid, p_round_number int, p_pairings jsonb) returns uuid
-- p_pairings: [{board, white_tp, black_tp|null, bye_kind|null, points_w, points_b}]
-- Upsert do round draft + replace all pairings, tudo numa transação.

publish_round(p_round_id uuid) returns void
finish_round(p_round_id uuid) returns void
reopen_round(p_round_id uuid) returns void

set_pairing_result(p_pairing_id uuid, p_result game_result) returns void
-- Deriva white_points/black_points do resultado (tabela fixa) e grava audit_log.
-- Se a rodada estiver 'finished', também dispara recalculate_standings.

swap_draft_players(p_round_id uuid, p_moves jsonb) returns void
-- Edições do rascunho: troca jogadores entre mesas, marca manual_override,
-- grava audit_log. Só em status 'draft'.

generate_initial_ranking(p_group_id uuid) returns void
approve_registration(p_registration_id uuid) returns uuid
-- Upsert do player global (match por cbx_id/fide_id/nome), cria tournament_player
-- no grupo da inscrição; se torneio ongoing → joined_at_round = próxima rodada
-- e cria byes 'late_entry' para as rodadas perdidas.
```

A geração em si (chamada da engine) fica na API route porque envolve WASM;
o **estado** só muda dentro de `save_round_draft`. Entre a leitura do estado e
a gravação pode haver corrida (ex.: resultado corrigido no meio) — mitigada
com um `state_fingerprint` (hash de pairings+status das rodadas anteriores do
grupo) calculado na leitura e conferido dentro da RPC; divergiu → erro
`STALE_STATE`, UI oferece regenerar.

### 5.3 API routes

```
POST  /api/admin/tournaments/[slug]/groups/[groupId]/rounds/generate
      → { roundId, warnings: Warning[] }
POST  /api/admin/tournaments/[slug]/rounds/[roundId]/publish | finish | reopen
PATCH /api/admin/tournaments/[slug]/pairings/[pairingId]        (resultado)
POST  /api/admin/tournaments/[slug]/rounds/[roundId]/swap       (edição de rascunho)
POST  /api/admin/tournaments/[slug]/registrations/[id]/approve
GET   /api/tournaments/[slug]/export/trf?group=<id>             (download TRF)
```

Autenticação: rotas usam o client Supabase **da sessão do usuário**
(`@supabase/ssr`) — RLS + validações das RPCs são a autoridade; a service-role
key não é usada no fluxo nativo.

---

## 6. Editor de rascunho — validações e avisos

Cálculo dos avisos é **server-side** (na resposta do generate e revalidado no
`publish_round`), exibido na UI; nunca bloqueia (RF-5):

| Aviso | Regra |
|---|---|
| `REMATCH` | par já se enfrentou em rodada anterior |
| `COLOR_STREAK` | jogador ficaria com 3 jogos seguidos da mesma cor |
| `COLOR_IMBALANCE` | \|brancas−pretas\| > 2 após a rodada |
| `SCORE_GAP` | diferença de pontos entre os pareados > 1.0 |
| `SECOND_PAIRING_BYE` | jogador receberia segundo bye de pareamento |
| `MANUAL_OVERRIDE` | mesa alterada manualmente (informativo, vai para auditoria) |

Pareamentos vindos direto da engine não geram avisos (por construção); os
avisos aparecem quando o árbitro edita.

---

## 7. Desempates configuráveis (RF-8)

- `tournaments.tiebreak_order text[]` (3.2) define a ordem.
- `recalculate_standings` passa a: (a) calcular também `wins` (já existe) e
  `progressive` (nova coluna em `standings`, soma cumulativa por rodada);
  (b) montar o `ORDER BY` do rank dinamicamente via `format()` a partir do
  array, com whitelist de colunas (nunca interpolar texto livre).
- Buchholz continua ignorando byes como hoje (sem "oponente virtual" FIDE
  nesta fase — documentado como limitação; não afeta homologação, pois
  tiebreaks não vão no TRF).
- UI pública: cabeçalho da tabela de classificação renderiza as colunas na
  ordem configurada (o RPC `get_tournament_standings` já retorna tudo).

---

## 8. Frontend

### 8.1 Novas páginas admin

```
app/admin/tournaments/[slug]/
├── settings/page.tsx        # config nativa: cor inicial, bye, tiebreaks, rating_kind
├── staff/page.tsx           # convidar organizer/arbiter por e-mail
├── groups/page.tsx          # CRUD de grupos + rounds_count por grupo
└── rounds/                  # REESCRITA da página atual
    ├── page.tsx             # tabs por grupo; timeline de rodadas com estado/ações
    └── [roundId]/
        ├── draft/page.tsx   # editor de rascunho (swap por drag ou seleção dupla)
        └── results/page.tsx # painel de resultados mobile-first (mesa a mesa,
                             #   botões grandes 1-0 / ½ / 0-1 / WO, avanço automático)
```

A página `rounds` atual mistura importação e gestão manual; passa a renderizar
por modo: `imported` → UI atual (imports), `native` → nova UI. Componentes
novos em `components/admin/pairing/`: `draft-board-list`, `swap-dialog`,
`warning-chips`, `result-pad`.

### 8.2 Hooks

`use-pairing.ts`: `useGenerateRound`, `usePublishRound`, `useFinishRound`,
`useReopenRound`, `useSwapDraft`, `useSetResult` — todos invalidando as
queries de rounds/pairings/standings existentes (TanStack Query, padrão já
usado em `use-tournament.ts`).

### 8.3 Público

- Rodadas `draft` já não chegam (RLS 3.7); nenhuma mudança estrutural.
- Páginas de impressão (RF-9): `app/tournaments/[slug]/rounds/[n]/print/page.tsx`
  e `standings/print/page.tsx` — HTML com CSS `@media print`, botão
  "Imprimir/PDF" aciona `window.print()`. **Decisão**: PDF via print do
  navegador nesta fase (zero dependência nova, atende "afixar na parede");
  geração server-side de PDF fica fora de escopo.

### 8.4 Inscrição pública

Formulário ganha: seleção de grupo (obrigatória quando >1), sexo e data de
nascimento. Aprovação (admin) mostra sugestão de categoria pelos critérios
(idade/rating/sexo) com override manual.

---

## 9. cron-import — guarda de modo

1. `process-tournament.ts`: primeira verificação — `tournament.mode !== 'imported'`
   → registra `last_status='error'`, `last_message='torneio nativo'`, pula.
2. Defesa no banco: trigger `before insert or update on tournament_imports`
   rejeita linhas cujo torneio seja `native`.
3. Sem outras mudanças no worker.

---

## 10. Auditoria

Toda RPC de mutação grava `audit_log` com `before/after` mínimos:

| action | payload |
|---|---|
| `set_result` | `{pairing_id, board, before: '1-0', after: '0-1'}` |
| `swap_pairing` | `{round, moves: [...]}` |
| `publish_round` / `finish_round` / `reopen_round` | `{round_number, group}` |
| `approve_registration` | `{registration_id, tp_id}` |
| `generate_round` | `{round_number, engine_exit: 0, fingerprint}` |

UI: aba "Histórico" no admin do torneio (lista paginada, filtro por rodada).

---

## 11. Testes

| Camada | Ferramenta | O quê |
|---|---|---|
| Unit TS | vitest (novo no projeto) | serializador TRF (golden files), parser de saída, mapeamento de resultados, cálculo de avisos |
| Engine | vitest + wasm | TRFs do diretório `test/` do próprio bbpPairings → saída idêntica à do binário nativo (golden) |
| Propriedade | vitest | simulador: N jogadores, R rodadas, resultados aleatórios; invariantes: sem rematch, sem 2º bye de pareamento, cores válidas, todos pareados |
| SQL/RPC | supabase local (`supabase test`/pgTAP ou script node) | máquina de estados: transições ilegais falham; advisory lock; fingerprint STALE_STATE |
| E2E manual | roteiro | torneio de 9 jogadores × 5 rodadas com bye solicitado, W.O., entrada tardia e desistência |

CI (GitHub Actions já existe no repo): job de testes TS; o build do WASM
**não** roda no CI (artefato commitado) — apenas um check de hash do VERSION.

---

## 12. Spike inicial (bloqueante, ~1 PR)

> **EXECUTADO em 2026-07-19 — TODOS os critérios verdes.** Resultado completo
> em [spike-f0-wasm.md](./spike-f0-wasm.md). Plano B (Cloud Run) descartado.
> Achado crítico: `-fexceptions` é obrigatório no build. Artefatos commitados
> em `lib/pairing/wasm/`.

Objetivo: eliminar o maior risco antes de qualquer migration.

1. Compilar bbpPairings com `em++` (descobrir patches necessários; fixar
   flags e commit upstream).
2. Rodar em Node 20 com MEMFS: parear os TRFs de exemplo do repositório
   upstream e comparar com o binário nativo (Windows) — saídas idênticas.
3. Validar as assunções marcadas neste doc:
   - 1ª coluna da saída = brancas; ordem das linhas = ordem de mesa;
   - sintaxe exata de `0000 - H/Z` na rodada a parear (pontos inclusos);
   - representação de `double_forfeit`;
   - tamanho do artefato e tempo de instanciação+pareamento p/ 200 jogadores.
4. Testar a rota Vercel (deploy de preview com a rota `generate` fake).

Critério de saída: os 4 itens verdes → seguir fases; item 1 inviável →
plano B: engine em container no Cloud Run (infra do cron-import), mesma
interface `pairRound()` — o resto do design não muda.

---

## 13. Plano de implementação (fases = PRs deployáveis)

| Fase | Conteúdo | Depende de |
|---|---|---|
| **F0** | Spike WASM (seção 12) | — |
| **F1** | Migrations A–B (mode, config, sex, grupos NOT NULL, backfill) + fix 006 + types | — |
| **F2** | Migrations C–F (draft, byes, staff, RLS, audit) + RPCs de ciclo de vida | F1 |
| **F3** | `lib/pairing/*` (engine + serializador + parser) + rota `generate` + testes golden | F0, F2 |
| **F4** | UI: timeline de rodadas por grupo, gerar/publicar/fechar (fluxo mínimo de grupo único) | F3 |
| **F5** | Editor de rascunho + avisos + auditoria na UI | F4 |
| **F6** | Painel de resultados mobile + reopen/correções | F4 |
| **F7** | Byes solicitados, entrada tardia, desistência (UI + geração) | F4 |
| **F8** | Inscrições integradas (grupo/sexo/nascimento, approve→tp, cutoff) + seeds | F2 |
| **F9** | Desempates configuráveis + progressivo | F2 |
| **F10** | Exportação TRF + páginas de impressão | F3 |
| **F11** | Guarda cron-import + settings/staff UI + polimento | F1 |

Marco "primeiro torneio real": **F0–F4 + F6** (dá para dirigir um torneio de
grupo único de ponta a ponta; byes solicitados manualmente via swap se
necessário).

## 14. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Build Emscripten exige patches profundos | Spike F0 com critério de saída e plano B (Cloud Run) que preserva o design |
| Serializador TRF sutilmente errado → pareamento errado silencioso | Golden tests contra binário nativo; validação estrita da própria engine (exit 3); fingerprint de estado |
| Enum `ALTER TYPE ADD VALUE` não roda em transação no Postgres | Migration C isolada em arquivo próprio, sem BEGIN explícito (padrão Supabase já contempla) |
| Corrida geração × correção de resultado | Advisory lock por grupo + `state_fingerprint` na RPC |
| RLS refactor quebrar telas existentes | F2 mantém `created_by` como caso do helper; testes de policy no supabase local |
| `initial_ranking` legado inconsistente (cron-import usa a coluna como chave de match) | A unicidade `(pairing_group_id, initial_ranking)` é imposta por **constraint trigger apenas para torneios `native`** — dados importados não são tocados nem validados retroativamente |

## 15. Questões em aberto (não bloqueiam F0–F2)

1. Bye de entrada tardia: `Z` (0 pontos) fixo, ou seguir `requested_bye_score`
   do torneio? Proposta: **fixo em 0** (padrão em eventos FIDE), campo extra
   só se houver demanda.
2. Convite de staff por e-mail exige fluxo de convite (usuário pode não ter
   conta). Proposta mínima: staff informa e-mail; vínculo efetiva-se no
   primeiro login daquele e-mail.
3. TRF de exportação: incluir seção de equipes vazia ou omitir? Verificar o
   validador da CBX na F10.

---

## Apêndice A — Exemplo trabalhado de TRF(bx) (modo `for_pairing`)

Cenário: grupo "Absoluto" de um torneio de **5 rodadas** (`XXR 5`), cor do
nº 1 sorteada como brancas (`XXC white1`), **5 jogadores**, rodadas 1 e 2
`finished`, gerando a **rodada 3**. O jogador 5 solicitou bye de ½ ponto para
a rodada 3 (`requested_bye_score = 0.5`).

Histórico: R1 — 1×3 `1-0`, 4×2 `0-1`, bye de pareamento para 5 (`U`, 1.0);
R2 — 2×1 `½-½`, 3×5 `1-0`, bye de pareamento para 4 (`U`, 1.0).

```
012 Aberto Exemplo - Absoluto
XXR 5
XXC white1
001    1 m    Souza, Ana                        2100 BRA     11111111 1990/00/00  1.5          3 w 1     2 b =
001    2 m    Lima, Bruno                       1950 BRA              1995/00/00  1.5          4 b 1     1 w =
001    3 w    Castro, Carla                     1800 BRA              2001/00/00  1.0          1 b 0     5 w 1
001    4 m    Dias, Daniel                      1650 BRA              2008/00/00  1.0          2 w 0  0000 - U
001    5 m    Elias, Edu                        1500 BRA              2010/00/00  1.5       0000 - U     3 b 0  0000 - H
```

Observações:

- Jogadores 1–4 têm exatamente **2 colunas** de rodada preenchidas → a engine
  infere que a rodada a parear é a 3, entre eles.
- Jogador 5 tem uma **terceira coluna** `0000 - H` → excluído do pareamento;
  seus pontos (1.5) **já incluem** o ½ do bye (1.0 do U + 0 da derrota + 0.5
  do H) — a engine valida essa soma.
- Sem linhas `BB*` porque a pontuação é a padrão FIDE (1/½/0).
- Saída esperada (ilustrativa — 1 e 2 já se enfrentaram, a engine resolve os
  floats): `2` na primeira linha, depois dois pares `startno_branco
  startno_preto`. O rascunho gravado teria 2 mesas + 1 linha de bye
  (`bye_kind='requested_half'`, 0.5 ponto) para o jogador 5.
- **As larguras deste exemplo são ilustrativas** — as posições normativas são
  as da tabela da seção 4.3, e os golden tests do spike são a verdade final.

## Apêndice B — Corpo de referência das RPCs críticas

Esboço (a versão final nasce na F2, com testes):

```sql
create or replace function publish_round(p_round_id uuid)
returns void language plpgsql security definer as $$
declare
  v_round    rounds%rowtype;
  v_unpaired int;
begin
  select * into v_round from rounds where id = p_round_id for update;
  if not found then
    raise exception 'ROUND_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_round.pairing_group_id::text, 42));

  if not is_tournament_manager(v_round.tournament_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_round.status <> 'draft' then
    raise exception 'INVALID_STATE: rodada não está em rascunho';
  end if;

  -- Todo jogador ativo e já ingressado precisa de mesa ou bye
  -- (byes solicitados viram linhas de pairing no rascunho, então basta isto):
  select count(*) into v_unpaired
  from tournament_players tp
  where tp.pairing_group_id = v_round.pairing_group_id
    and tp.status = 'active'
    and tp.joined_at_round <= v_round.round_number
    and not exists (
      select 1 from pairings p
      where p.round_id = p_round_id
        and (p.white_tp_id = tp.id or p.black_tp_id = tp.id)
    );
  if v_unpaired > 0 then
    raise exception 'UNPAIRED_PLAYERS: % jogador(es) ativo(s) sem mesa', v_unpaired;
  end if;

  update rounds set status = 'ongoing', published_at = now()
  where id = p_round_id;

  insert into audit_log (tournament_id, actor, action, entity, entity_id, payload)
  values (v_round.tournament_id, auth.uid(), 'publish_round', 'round', p_round_id,
          jsonb_build_object('round_number', v_round.round_number,
                             'pairing_group_id', v_round.pairing_group_id));
end $$;
```

```sql
create or replace function set_pairing_result(p_pairing_id uuid, p_result game_result)
returns void language plpgsql security definer as $$
declare
  v_pairing pairings%rowtype;
  v_round   rounds%rowtype;
  v_w numeric(3,1);
  v_b numeric(3,1);
begin
  select * into v_pairing from pairings where id = p_pairing_id for update;
  if not found then raise exception 'PAIRING_NOT_FOUND'; end if;
  select * into v_round from rounds where id = v_pairing.round_id;

  if not is_tournament_manager(v_pairing.tournament_id) then
    raise exception 'FORBIDDEN';
  end if;
  if v_round.status = 'draft' then
    raise exception 'INVALID_STATE: rodada ainda não publicada';
  end if;
  if v_pairing.is_bye then
    raise exception 'INVALID_STATE: bye não recebe resultado';
  end if;

  -- Tabela fixa resultado → pontos (usa BBW/BBD padrão FIDE)
  select case p_result
           when '1-0' then 1.0  when '0-1' then 0.0
           when '1/2-1/2' then 0.5
           when 'forfeit_white' then 0.0 when 'forfeit_black' then 1.0
           when 'double_forfeit' then 0.0 else null end,
         case p_result
           when '1-0' then 0.0  when '0-1' then 1.0
           when '1/2-1/2' then 0.5
           when 'forfeit_white' then 1.0 when 'forfeit_black' then 0.0
           when 'double_forfeit' then 0.0 else null end
  into v_w, v_b;

  update pairings
  set result = p_result, white_points = v_w, black_points = v_b
  where id = p_pairing_id;

  insert into audit_log (tournament_id, actor, action, entity, entity_id, payload)
  values (v_pairing.tournament_id, auth.uid(), 'set_result', 'pairing', p_pairing_id,
          jsonb_build_object('board', v_pairing.board_number,
                             'before', v_pairing.result, 'after', p_result));

  -- Rodada já fechada (correção tardia) → reprocessa classificação na hora
  if v_round.status = 'finished' then
    perform recalculate_standings(v_pairing.tournament_id);
  end if;
end $$;
```

Nota: `p_result = '*'` (desfazer lançamento) é permitido enquanto a rodada
está `ongoing`; pontos viram `null`.

## Apêndice C — Adições em `types/database.ts`

```ts
export type TournamentMode = 'native' | 'imported';
export type InitialColor   = 'white1' | 'black1';
export type RatingKind     = 'std' | 'rpd' | 'blz';
export type RoundStatus    = 'draft' | 'pending' | 'ongoing' | 'finished'; // +draft
export type ByeKind        = 'pairing' | 'requested_half' | 'requested_zero' | 'late_entry';
export type StaffRole      = 'organizer' | 'arbiter';
export type TiebreakKey    = 'buchholz' | 'buchholz_cut1' | 'sonneborn_berger'
                           | 'wins' | 'progressive';

// Tournament ganha: mode, requested_bye_score, initial_color, rating_kind, tiebreak_order
// Player ganha: sex: 'm' | 'w' | null
// TournamentPlayer ganha: joined_at_round: number
// PairingGroup ganha: rounds_count: number | null
// Pairing ganha: bye_kind: ByeKind | null; manual_override: boolean

export interface TournamentStaff {
  id: string;
  tournament_id: string;
  user_id: string;
  role: StaffRole;
  invited_by: string | null;
  created_at: string;
}

export interface RequestedBye {
  id: string;
  tournament_id: string;
  tp_id: string;
  round_number: number;
  created_by: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  tournament_id: string;
  actor: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export type PairingWarning =
  | { code: 'REMATCH'; board: number }
  | { code: 'COLOR_STREAK'; board: number; tpId: string }
  | { code: 'COLOR_IMBALANCE'; board: number; tpId: string }
  | { code: 'SCORE_GAP'; board: number; gap: number }
  | { code: 'SECOND_PAIRING_BYE'; tpId: string }
  | { code: 'MANUAL_OVERRIDE'; board: number };
```
