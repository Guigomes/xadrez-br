# Requisitos — Torneios Nativos (Sistema Suíço)

> Documento de requisitos da fase "torneios nativos". Elaborado em 2026-07-06.
> Status: **aprovado para desenho técnico**.

---

## 1. Visão

O chess-viewer deixa de ser apenas um espelho do chess-results.com e passa a ser a
**fonte de verdade** de torneios suíços: o organizador cria o torneio, recebe
inscrições, gera pareamentos FIDE Dutch, lança resultados e exporta o TRF para
homologação — tudo dentro do sistema. Torneios importados do chess-results
continuam existindo como um segundo tipo.

## 2. Decisões de escopo (fechadas)

| Decisão | Escolha |
|---|---|
| Engine de pareamento | **bbpPairings** (FIDE Dutch, engine homologada), compilado para **WASM**, executando em API route do Next.js — sem serviço novo |
| Fluxo de pareamento | Automático com **ajuste manual antes de publicar** (rascunho → revisão → publicação, estilo Swiss Manager) |
| cron-import | **Permanece** como modo alternativo; torneio ganha tipo `nativo` ou `importado` |
| Escopo da fase | Núcleo + categorias/grupos + inscrições online + exportação TRF/PDF |
| Pareamento acelerado (Baku) | **Fora de escopo** |
| Pontuação do bye solicitado | **Configurável por torneio** (½ ponto ou 0) |
| Torneios por equipes | **Fora de escopo** |

## 3. O que já existe e será reaproveitado

- Schema de `tournaments`, `tournament_players`, `rounds`, `pairings`, `standings`,
  com enums de resultado cobrindo bye, W.O. e duplo W.O. (migration 001).
- **Inscrições online** (migration 011): fila pública com aprovação do organizador,
  dados de contato privados, upload de comprovante de pagamento.
- **Grupos de pareamento** (`pairing_groups`, migrations 006/007/010) com
  standings por grupo.
- **Recálculo de classificação** via RPC com Buchholz, BH-1 e Sonneborn-Berger.

O trabalho novo se concentra em: engine de pareamento, ciclo de vida da rodada,
ferramentas de arbitragem e exportação.

---

## 4. Requisitos Funcionais

### RF-1 — Tipo de torneio
- Todo torneio tem um modo: **nativo** ou **importado**.
- O cron-import nunca altera torneios nativos; as ferramentas de pareamento ficam
  desabilitadas em torneios importados.
- Migração: torneios existentes viram `importado`.

### RF-2 — Consolidação semântica: grupos × categorias
Hoje existem três caminhos para responder "em que grupo o jogador joga"
(`tp.pairing_group_id`, `tp.category_id` → `categories.pairing_group_id`), sem
garantia de coerência. Com pareamento nativo, o grupo vira estrutural (a engine
roda por grupo) e a ambiguidade passa a causar pareamentos errados e
irreversíveis. Consolidação:

1. **`pairing_groups` = divisão estrutural, obrigatória.** Todo torneio nativo
   nasce com ao menos um grupo (padrão "Único"). `tournament_players.pairing_group_id`
   vira NOT NULL para nativos — elimina a convenção "NULL = grupo único".
2. **`tournament_categories` = recorte de premiação, sem papel no pareamento.**
   Critérios de idade/rating servem para sugerir/validar enquadramento, nunca
   para decidir grupo. O link `categories.pairing_group_id` passa a significar
   apenas escopo opcional da premiação ("vale dentro do grupo X").
3. **Aprovação de inscrição exige grupo**; categoria é auto-sugerida pelos
   critérios, com override manual.
4. **Adicionar campo `sex`/`gender` em `players`** — necessário para categoria
   "Feminino" e exigido pelo formato TRF da FIDE.

### RF-3 — Gestão de jogadores e ranking inicial
- Ao encerrar inscrições, o sistema gera o **ranking inicial** (seed) por grupo,
  ordenando por rating — usando o rating adequado ao ritmo (standard/rapid/blitz
  conforme `time_control`) — com desempate alfabético. Organizador pode ajustar
  manualmente.
- **Entrada tardia**: jogador pode entrar após a rodada 1, recebendo bye
  (pontuação conforme configuração do torneio) nas rodadas perdidas.
- **Desistência** (`withdrawn`): sai das rodadas futuras sem apagar histórico.
- **Bye solicitado**: registrado pelo árbitro antes de gerar o pareamento da
  rodada; pontuação conforme configuração do torneio (RF do escopo: ½ ou 0,
  por torneio).

### RF-4 — Engine de pareamento (FIDE Dutch via bbpPairings/WASM)
- Pareamento da rodada N respeita pontuação, histórico de confrontos,
  alternância/equilíbrio de cores, floaters e regras de bye — delegado ao
  bbpPairings.
- Estado do torneio serializado em **TRF(x)** como entrada da engine; saída
  parseada de volta para `pairings`. O TRF é o formato pivô (atende também RF-9).
- Bye automático para número ímpar (nunca para quem já recebeu bye).
- Um pareamento independente por `pairing_group`.

### RF-5 — Ciclo de vida da rodada
```
gerar rascunho → revisar/ajustar → publicar → lançar resultados → fechar → próxima
```
- **Rascunho**: invisível ao público.
- **Ajuste manual**: árbitro pode trocar jogadores entre mesas. O sistema valida
  e emite avisos (confronto repetido, desequilíbrio de cores, diferença de
  pontuação) mas não bloqueia — a palavra final é do árbitro.
- **Publicar**: torna a rodada visível; operação atômica.
- **Fechar**: exige todos os resultados lançados; dispara recálculo de standings
  e libera a geração da próxima rodada.
- **Reabrir/corrigir**: permitido enquanto a rodada seguinte não foi gerada;
  depois disso, correção de resultado recalcula pontos mas mantém pareamentos
  já realizados.

### RF-6 — Lançamento de resultados
- Interface rápida por mesa (1-0, ½-½, 0-1, W.O.), otimizada para o celular do
  árbitro.
- Resultados especiais: W.O. simples e duplo, resultado adjudicado.
- Auditoria: registro de quem lançou/alterou cada resultado e quando.

### RF-7 — Inscrições online (integração com o existente)
- Fluxo atual (fila → aprovação → `tournament_player`) passa a alimentar o
  ranking inicial.
- Cutoff automático: encerrar inscrições ao gerar a rodada 1; aprovações
  posteriores viram entrada tardia (RF-3).
- `tournament_registrations` passa a capturar os campos exigidos pela
  consolidação (grupo obrigatório, sexo, data de nascimento para categorias).

### RF-8 — Desempates configuráveis
- Ordem de critérios definida por torneio (hoje fixa): Buchholz, Buchholz Cut-1,
  Sonneborn-Berger, confronto direto, número de vitórias, progressivo.

### RF-9 — Exportação
- **TRF** por grupo, aceito pela FIDE/CBX para homologação de rating.
- **PDF**: pareamentos da rodada (por mesa e por nome, para afixar) e
  classificação final.

---

### RF-10 — Perfis de staff e atribuição de mesas *(adicionado em 2026-07-19)*
- O organizador pode **adicionar outros organizadores** e **atribuir árbitros**
  ao torneio (papéis por torneio, tabela `tournament_staff`).
- O organizador pode definir **qual árbitro atende cada mesa** de uma rodada.
- O árbitro pode **assumir mesas por conta própria**, desde que a mesa ainda
  não tenha árbitro atribuído.
- Uma mesa atribuída só pode ser **liberada pelo próprio árbitro atribuído ou
  por um organizador**.
- O **resultado de uma mesa com árbitro atribuído** só pode ser lançado por
  esse árbitro ou por um organizador; mesas sem atribuição seguem a regra
  atual (qualquer staff).
- Escopo da atribuição: por mesa **da rodada** (não persiste entre rodadas).

## 5. Requisitos Não Funcionais

- **Corretude**: pareamento validado contra a suíte de testes do bbpPairings;
  TRF aceito pelo validador da FIDE.
- **Desempenho**: gerar rodada para ~200 jogadores em poucos segundos.
- **Concorrência**: múltiplos árbitros lançando resultados simultaneamente sem
  conflito; publicação de rodada atômica.
- **Permissões**: papel de **árbitro por torneio** (hoje só existe `created_by`;
  organizador precisa delegar lançamento de resultados).
- **Auditoria**: trilha de alterações em resultados e pareamentos.

## 6. Fora de escopo desta fase

Torneios por equipes, engines round-robin/knockout, pareamento acelerado,
pagamento online integrado (comprovante manual já existe), sincronização de
ratings CBX/FIDE, push notifications.

## 7. Riscos conhecidos

1. **Build do bbpPairings para WASM** (C++/Emscripten): validar cedo com um
   spike — é a maior incerteza técnica da fase.
2. **Serialização TRF** com casos especiais (entrada tardia, byes solicitados,
   desistências) — erros aqui produzem pareamentos errados silenciosamente.
3. **Reabertura de rodada** após pareamento seguinte já gerado — regra de
   negócio delicada, precisa de mensagens claras na UI.
4. **Migration 006 com RLS quebado** (`t.organizer_id` não existe; coluna real é
   `created_by`) — corrigir antes de qualquer setup de banco novo (tarefa já
   aberta em separado).
