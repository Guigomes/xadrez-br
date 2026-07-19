# Spike F0 — bbpPairings em WASM: RESULTADO ✅

> Executado em 2026-07-19. Critérios da seção 12 do
> [design-tecnico-torneios-nativos.md](./design-tecnico-torneios-nativos.md).
> **Veredicto: viável — seguir com o plano A (WASM em API route). Plano B
> (Cloud Run) descartado.**

## Critérios validados

| # | Critério | Resultado |
|---|---|---|
| 1 | Compilar com em++ | ✅ **Zero patches no código-fonte.** emsdk 6.0.3, flags no `scripts/build-bbppairings.sh`. Só warnings de deprecação (`wstring_convert`, inofensivos) |
| 2 | Golden tests em Node 20 (MEMFS) | ✅ 3/3 casos Dutch do diretório `test/` upstream com **saída byte-idêntica** ao `.output.expected` |
| 3 | Assunções do design | ✅ Todas confirmadas (detalhes abaixo) |
| 4 | Tamanho e desempenho | ✅ 556 KB `.wasm` + 73 KB `.mjs`; torneio pequeno ~100 ms; **201 jogadores, rodada 9: ~3 s** (inclui instanciação do módulo) |

## Descobertas importantes (custaram debugging — não repetir)

1. **`-fexceptions` é obrigatório.** O Emscripten desabilita exceções C++ por
   padrão e o bbpPairings usa exceções para sinalizar erros de validação do
   TRF. Sem a flag, qualquer TRF inválido vira `Aborted(undefined)` em vez de
   exit code 3 com mensagem legível. Custo: binário passou de 396 KB para
   556 KB — aceitável.
2. **A saída do gerador (`-g`) não inclui a linha `XXR`** — quem consome
   precisa anexá-la. Irrelevante para produção (nosso serializador sempre
   emite XXR), mas afeta os testes que usam o gerador.
3. **Sintaxe do gerador**: `--dutch -g config.txt -o out.trf -s seed`
   (o `-s` vem depois do `-o`). Config: `PlayersNumber=201`, `RoundsNumber=8`.
4. O emsdk 6.x no Windows/Git Bash: usar `upstream/emscripten/em++.exe` por
   caminho direto (o `emsdk_env.sh` não popula o PATH do Git Bash de forma
   confiável).

## Assunções do design confirmadas na prática

- **`0000 - Z` exclui o jogador da rodada a parear** — confirmado pelo caso
  `dutch_2025_C5` upstream (jogador 4 excluído; bye vai para outro).
- **`0000 - H` (bye de ½) com pontos inclusos é aceito** — variante do C5
  com `0.0→0.5` e `Z→H` retorna exit 0 e pareamento válido.
- **Primeira coluna da saída = brancas** — verificado por análise de
  preferência de cor nos casos golden (jogadores com histórico `w,b` saem na
  primeira coluna; `b,w` na segunda).
- **Exit codes** confirmados no fonte (`src/main.cpp`): 1 = sem pareamento
  válido, 2 = erro inesperado, 3 = entrada inválida, 4 = limite, 5 = arquivo.
- **Nenhum código OS-específico**: única dependência de plataforma é
  `<filesystem>`, suportada pelo MEMFS.

## Artefatos

- `lib/pairing/wasm/bbppairings.{mjs,wasm}` — build commitado
- `lib/pairing/wasm/VERSION` — commit upstream + flags exatas
- `lib/pairing/wasm/{LICENSE.txt,Apache-2.0.txt}` — licença upstream (Apache 2.0)
- `scripts/build-bbppairings.sh` — build reproduzível

## Medições

| Cenário | Tempo (Node 20, inclui instanciação) |
|---|---|
| 6 jogadores, rodada 3 | ~70–120 ms |
| `issue_7` (caso mais pesado do upstream) | ~150–420 ms |
| 201 jogadores, rodada 9 | 2,7–3,0 s |

Meta do design ("poucos segundos para ~200 jogadores"): **atendida**. Dentro
do timeout padrão de serverless da Vercel com folga.

## Próximo passo

F3 do plano: wrapper `lib/pairing/engine.ts` + serializador TRF (o formato de
consumo/produção está provado; falta a serialização a partir do banco).
