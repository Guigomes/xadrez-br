# Pendência: tipagem do cliente Supabase (erros `never`)

**Status:** aberto — adiado de propósito (não bloqueia deploy).
**Registrado em:** 2026-08-07.

## Sintoma

`npx tsc --noEmit` acusa ~524 erros, quase todos do tipo:

```
Property 'X' does not exist on type 'never'.
Argument of type '{ ... }' is not assignable to parameter of type 'never' | 'undefined'.
```

Toda consulta (`supabase.from(...).select(...)`, `supabase.rpc(...)`) resolve o resultado pra `never`. `next.config.js` tem `typescript.ignoreBuildErrors: true`, então a Vercel builda normal — por isso está tolerado. O gate real do projeto é o `npx next lint` (0 erros).

## Causa raiz (diagnosticada)

O generic `Database` **é** passado ao cliente (`createBrowserClient<Database>` em `lib/supabase/client.ts`, `createServerClient<Database>` em `lib/supabase/server.ts`), mas não "pega":

1. O supabase-js exige que `Database['public']` satisfaça `GenericSchema`, que pede as chaves `Tables`, **`Views`** e `Functions`. Nosso `Database` não tinha `Views`.
2. Mais importante: `GenericTable.Row` é `Record<string, unknown>`. Nossos `Row` em `types/database.ts` são **`interface`** (UserProfile, Tournament, …). No TypeScript, **`interface` não é atribuível a `Record<string, unknown>`** (falta index signature implícita) — coisa que um `type` alias com objeto literal satisfaz.
3. Como a constraint de `GenericSchema` falha, o cliente cai pro schema default e toda linha vira `never`.

Confirmado com sonda: `const { data } = await s.from('tournaments').select('id'); data![0]` continua `never` mesmo depois de adicionar `Views`, `Relationships: []` e registrar todas as tabelas/funções. O bloqueio é o `interface` vs `Record`.

## Por que não foi corrigido agora

Corrigir mexe no tipo compartilhado do app inteiro e revela erros reais que hoje estão escondidos atrás do `never` — é o "não vale tentar zerar isso de uma vez" do `CLAUDE.md`. Deve ser um PR próprio, isolado das features.

Tentativa de completar o `Database` à mão (registrar tabelas/funções faltantes + wrapper `Relationships` + `Views`) foi **revertida**: não mudou o count (524 → 524), porque o bloqueio real é o `interface` vs `Record`, não a completude do schema.

## Caminho recomendado (PR isolado)

**Opção 1 (preferida):** regenerar os tipos no formato oficial (Row como `type` inline, não `interface`):

```bash
npx supabase gen types typescript --project-id <id> > types/database.generated.ts
```

Depois apontar `import type { Database } from` pro arquivo gerado e migrar os tipos de domínio (TournamentFormValues, etc.) que hoje vivem em `types/database.ts`.

**Opção 2:** converter à mão os ~30 `Row` de `interface` pra `type` em `types/database.ts`, adicionar `Views: Record<string, never>`, e `Relationships: []` em cada tabela do bloco `Database`.

### Ao regenerar, não esquecer

Coisas que a geração automática **não** traz e precisam continuar no `database.ts` (ou serem re-adicionadas):

- Tabelas usadas no código mas não registradas no `Database` atual: `tournament_registrations`, `pairing_groups`, `tournament_staff`, `board_arbiters`, `requested_byes`, `audit_log`, `tournament_imports`, `push_subscriptions`, `admin_fcm_tokens`, `kb_chunks`.
- Funções RPC usadas mas não registradas: `generate_initial_ranking`, `save_round_draft`, `generate_test_players`, `cleanup_test_players`, `approve_registration`, `swap_draft_players`, `override_pairing_players`, `set_pairing_result`, `set_my_capabilities`, `get_my_tournament_role`, `get_tournament_staff`, `search_staff_candidates` (migration 062), `add_staff_by_email`, `remove_staff`, `assign_board_arbiter`, `unassign_board_arbiter`.
- Coluna nova `tournaments.time_control_kind` (enum `time_control_kind`, migration 061) — já está no `Tournament`/`TournamentFormValues`/`TournamentListItem` do `database.ts`; conferir que o tipo gerado a inclui.
- Tipos de domínio (não-tabela) que o `database.ts` exporta e o app importa: `TournamentFormValues`, `PlayerFormValues`, `PairingResultUpdate`, `TournamentListItem`, `StandingRow`, `PlayerHistoryRow`, `RoundPairingRow`, e os union types (`GameResult`, `RatingKind`, `TimeControlKind`, etc.).

### Depois de aplicar

- `npx tsc --noEmit` deve cair de ~524 pra perto de 0 — mas vai **revelar erros reais** antes escondidos (colunas selecionadas que não existem, casts errados). Corrigir esses é o trabalho de verdade do PR.
- Manter `ignoreBuildErrors: true` até zerar, pra não travar deploy no meio da migração.
