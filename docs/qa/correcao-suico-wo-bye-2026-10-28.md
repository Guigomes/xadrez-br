# Correção de WO, byes, ausência e desempates

Migration `20261028130450_fide_2026_unplayed_standings.sql` aplicada e registrada em produção em 2026-10-28. A publicação do código segue o fluxo de push na `main` e GitHub Actions.

## Mudanças

- Recálculo FIDE 2026 para suíços nativos e do app: tratamento das rodadas não jogadas nos artigos 16.3–16.5, incluindo ajuste do escore de adversários, adversário fictício com limite, corte especial BH-1 e contribuição de WO/bye no SB.
- Não altera pontos concedidos nem resultados. Os dados dos importados continuam sob responsabilidade da fonte externa; a função nativa não os recalcula.
- Ausentes e desistentes mantêm o histórico e recebem recálculo completo dos critérios. O progressivo percorre todas as rodadas efetivamente iniciadas, incluindo as sem partida, mas ignora rodadas futuras em rascunho. Um resultado ainda pendente não é tratado como ausência.
- `games_played` conta apenas jogos no tabuleiro e coincide com `wins + draws + losses`. WO e bye continuam pontuando, sem virar jogos disputados.
- O critério existente `wins` mantém sua semântica de vitórias no tabuleiro, agora explicitada como FIDE **WON**. Não é o critério **WIN**, que incluiria vitórias sem jogar. Não foram criados novos campos nem alteradas assinaturas.
- Duplo WO mantém o adversário no TRF, sem registrar uma cor de partida efetivamente disputada.
- A cópia de `progressive` em `tournament_players` passa pelo sincronizador central, junto dos demais valores de classificação.

Referência: [FIDE Play-Off and Tie-Break Regulations, março/2026](https://handbook.fide.com/chapter/TieBreakRegulations032026).

## Validação e reprodução

```
node --env-file=.env.local scripts/test-fide-standings.mjs
node --env-file=.env.local --import tsx scripts/test-audit-trf.mjs
npm test
npm run type-check
```

O primeiro comando usa somente os dois torneios privados identificados na auditoria anterior. Abre uma transação, instala as novas definições apenas dentro dela, compara campos e caches e testa cenários com savepoints. No final faz **ROLLBACK** e verifica as definições, permissões, resultados e classificações anteriores. Não registra nem aplica uma migration permanentemente. A comparação dos dados normais ignora somente a cópia antiga de progressivo, que não era sincronizada; a classificação oficial permanece idêntica.

Foram conferidas as 11 linhas do cenário especial contra valores fixos calculados independentemente. Também se verificam resultado pendente, rodada em rascunho, limite por quantidade de rodadas do grupo, corte VUR maior que o menor adversário e preservação de importados.

O segundo comando exporta os torneios reais de teste por leitura pública e executa o checker local do WASM. Exige exit 0 **e ausência de discrepâncias no relatório**, não apenas sucesso do processo. Não grava arquivos TRF nem muda o banco.

Resultados da validação:

- 239 assertivas SQL passaram; quatro verificações adicionais confirmaram a restauração após rollback.
- Os dois TRFs passaram: seis rodadas normais e cinco com WO/byes/ausência, sem discrepâncias no checker.
- 217 testes Vitest passaram, incluindo os três novos casos de WO na serialização/exportação.
- Checagem TypeScript passou; lint dos arquivos alterados sem erros (dois avisos de `any` já existentes no arquivo de testes).
- Assinaturas e ACLs das funções permaneceram idênticas. Nenhuma nova tabela, coluna, enum ou RPC pública. A regeneração de tipos confirmou que não há mudança de assinatura desta correção; diferenças de tabelas externas de sparring não foram incluídas.
- Na validação inicial, somente a nova migration estava pendente. Na publicação, ela foi aplicada e registrada; `check-migrations` confirmou todos os arquivos e registros alinhados.
- Somente os dois torneios privados da auditoria foram recalculados permanentemente: 20 e 11 jogadores, sem divergência entre classificação e cópias, nem entre partidas disputadas e V/E/D. Nenhum torneio histórico/importado recebeu recálculo em massa. A cobrança permaneceu desativada.

### Correção da convenção da auditoria anterior

O relatório inicial assumiu **WIN** na comparação de ordem, mas o sistema sempre armazenou vitórias no tabuleiro (**WON**). Preservada essa semântica, a ordem final correta dos seeds do cenário especial é:

`11, 9, 7, 6, 3, 10, 1, 8, 4, 5, 2`.

O nº 11 continua sendo o primeiro: 3 pontos, BH 13, BH-1 11,5 e SB 7,75. A diferença entre nº 9 e nº 7 é resolvida por WON (1 contra 0), não pelo seed. Nenhum resultado foi manipulado para obter essa ordem.

## Publicação e reversão

1. Revisar e publicar o código e a migration juntos. A mudança é compatível com clientes antigos, sem novo campo/assinatura.
2. Aplicar pelo fluxo existente: `node --env-file=.env.local scripts/apply-sql.mjs 20261028130450_fide_2026_unplayed_standings.sql`.
3. Conferir o registro com `scripts/check-migrations.mjs` e regenerar os tipos pelo fluxo do projeto. Como não há alteração de assinatura, não se espera mudança dos tipos gerados.
4. Recalcular explicitamente os dois torneios privados da auditoria e verificar os valores. Não há backfill automático nem recálculo em massa de torneios históricos/importados.
5. Rollback funcional: restaurar somente `recalculate_standings` e `sync_player_scores_from_standings` da migration `20261024120000_sync_player_scores.sql`, mantendo as restrições de EXECUTE da `20261024140000_restrict_internal_rpcs.sql`. Recalcular apenas os torneios afetados se for necessário voltar aos critérios anteriores. Resultados e pontos concedidos são preservados nos dois caminhos.
