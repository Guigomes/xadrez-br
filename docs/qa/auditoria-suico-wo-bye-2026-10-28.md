# Auditoria do suíço, WO, byes, ausência e desempates

Data: 28/10/2026. Código publicado: `e29a8ec`.

## Escopo e método

1. Auditoria somente leitura do torneio anterior: [Teste de inscrições anônimas](https://www.gambitotorneios.com.br/torneios/teste-inscricoes-anonimas-mvs3eg8j/standings), ID `fd807e1a-0b12-4f4a-b755-ae9112148d30`.
2. Novo torneio privado, gratuito e fictício: [Teste WO Bye Desempates](https://www.gambitotorneios.com.br/torneios/teste-wo-bye-desempates-mvs3slnh/standings), ID `66e2e118-ca2f-4b8b-8096-dd677e430a11`, grupo `20846bee-01df-4e4d-bae8-590dc1ed76ab`.
3. Inscrições pela API de produção sem cookies nem Authorization; aprovação e resultados pelas RPCs normais da organização; geração pela API de produção.
4. Não há ação/RPC de ausência/desistência localizada no produto. Esses estados foram preparados como fixtures SQL, exclusivamente nos participantes fictícios do novo torneio. Isso testa o comportamento do motor diante desses estados, **não** um fluxo de interface para alterá-los. Nenhuma nota, posição ou valor de desempate foi escrito pelo teste.
5. Sem navegador conectado: validação funcional por API, leitura do banco e execução local do WASM publicado. Não é validação visual, endosso FIDE ou certificação independente de toda a implementação Dutch.

Fontes normativas:

- [FIDE Dutch, vigente desde fevereiro/2026](https://handbook.fide.com/chapter/C0403202602).
- [Desempates FIDE, vigente desde março/2026](https://handbook.fide.com/chapter/TieBreakRegulations032026), especialmente artigos 7.5, 8, 9 e 16.
- [bbpPairings no commit usado pelo projeto](https://github.com/BieremaBoyzProgramming/bbpPairings/tree/7dca5c007148505a3dd35ed37b6e7581b7937a3e).

## 1. Torneio anterior: 20 jogadores, seis rodadas

Resultado: nenhuma divergência encontrada nas verificações executadas.

- 10 confrontos por rodada; 20 jogadores distintos por rodada; 60 confrontos sem repetição.
- Nenhum ajuste manual nos confrontos.
- Rodada inicial: divisão entre metades do ranking inicial e cor inicial corretas.
- Preferências absolutas de cor respeitadas; diferença máxima brancas–pretas de 2; nenhuma sequência de três cores iguais.
- Reconstrução de todas as rodadas a partir de pontos e histórico anteriores: adversários e cores idênticos à produção, seis de seis rodadas.
- Verificador completo `--dutch ... -c`: saída para todas as rodadas sem tabela de discrepâncias, stderr vazio, exit 0. O exit 0 sozinho não basta: o checker pode reportar discrepâncias no stdout.
- Pontos, Buchholz, Buchholz Cut-1 e Sonneborn-Berger recalculados independentemente a partir das 60 partidas: todos os 20 registros coincidiram.
- Históricos de flutuação e diferenças de pontuação reconstruídos. Houve confrontos entre pontuações diferentes: 0, 0, 2, 4, 4 e 4 nas rodadas 1 a 6. A maior diferença foi 1,5 ponto na última rodada, entre o líder isolado nº 18 (5 pontos antes da rodada) e o nº 3 (3,5). Não é, por si só, uma infração.

Limite da evidência: a reconstrução e o checker usam o mesmo bbpPairings da produção. Restrições objetivas e desempates foram conferidos por lógica independente, mas não foi reimplementada uma segunda engine para provar separadamente todas as prioridades de qualidade C6–C21.

## 2. Novo torneio: 11 jogadores, cinco rodadas

Números abaixo identificam o ranking inicial de cada jogador fictício.

| Rodada | Cenário |
|---|---|
| 1 | WO das brancas, WO das pretas, duplo WO, vitória normal, empate e bye automático de 1 ponto ao nº 11 |
| 2 | Bye solicitado de ½ ponto ao nº 1; demais partidas empatadas |
| 3 | Bye solicitado de zero ao nº 2; nº 4 ausente; bye automático de 1 ponto ao nº 3; demais partidas empatadas |
| 4 | Nº 4 retorna; nº 5 desiste e sai dos emparceiramentos; demais partidas empatadas |
| 5 | Nº 5 continua fora; demais partidas empatadas |

Resultados persistidos: 1 WO das brancas, 1 WO das pretas, 1 duplo WO, 1 vitória normal, 20 empates, 2 byes automáticos, 1 bye solicitado de meio ponto e 1 de zero. As cinco rodadas foram finalizadas e o torneio encerrado explicitamente pela organização.

### Funcionou

- 11 inscrições anônimas e aprovações sem vincular os fictícios à conta.
- WO simples: 1 ponto ao vencedor e zero ao ausente, independentemente da cor.
- Duplo WO: zero para ambos.
- Byes: automático = 1; solicitado de meio = 0,5; solicitado de zero = 0.
- Ausente não emparceirado na R3; volta do ausente na R4; retirado excluído de R4 e R5.
- Sem jogador duplicado por rodada; todos os ativos cobertos por confronto ou bye solicitado/automático.
- Bye automático não repetido nem atribuído a quem já vencera por WO.
- Nenhum adversário repetido entre partidas efetivamente jogadas. Voltar a parear adversários de um WO não foi classificado como repetição de partida jogada.
- Reconstrução por rodada, incluindo o estado ativo/ausente/retirado e o bye solicitado vigente: cinco de cinco rodadas com adversários e cores idênticos ao motor.
- A ordenação da classificação segue os valores atualmente armazenados; a falha principal é o cálculo desses valores, não a comparação numérica da tabela.

Na última rodada, o nº 4 recebeu sua terceira branca consecutiva entre jogos efetivamente disputados, enfrentando o nº 11, um topscorer. A exceção de última rodada envolvendo topscorer/adversário é prevista pelo Dutch; não foi contada como falha automática. A preferência de cor ignora partidas não jogadas.

### Falhas e divergências

Foram executadas 162 comparações escalares/de cenário: 129 coincidiram e 33 divergiram. As 33 divergências não são 33 bugs independentes:

- 24 diferenças de Buchholz, Buchholz Cut-1 ou Sonneborn-Berger em oito jogadores por critério, comparadas ao cálculo FIDE 2026.
- 2 diferenças de progressivo, após ausência ou retirada.
- 6 diferenças entre `games_played` e o número de partidas efetivamente disputadas no tabuleiro: WOs entram no contador, mas não em vitórias/empates/derrotas de tabuleiro.
- 1 comparação de ordem final divergente, consequência dos critérios incorretos.

#### P1. Desempates não tratam corretamente rodadas não jogadas

O recálculo independente aplicou o artigo 16 vigente: ajustes de ausências terminais no escore usado pelos adversários, adversário fictício para rodadas não jogadas, limites do artigo 16.4 e corte especial para rodadas voluntariamente não jogadas. A implementação atual ignora byes no BH/BH-1/SB e não inclui a contribuição da vitória por WO no SB.

Não há regulamento alternativo explicitado para esses testes. A referência de correção usada é FIDE 2026, não a limitação antiga documentada no desenho técnico do projeto.

| Nº | Pontos | Posição atual → esperada* | BH atual → esperado | BH-1 atual → esperado | SB atual → esperado |
|---|---:|---:|---:|---:|---:|
| 1 | 2 | 8 → 7 | 10 → 12 | 8,5 → 10 | 3,5 → 5 |
| 2 | 1,5 | 10 → 11 | 8 → 9 | 6,5 → 7,5 | 2,5 → 3 |
| 3 | 2,5 | 6 → 5 | 9,5 → 12 | 7,5 → 10 | 3,75 → 6,25 |
| 4 | 1,5 | 9 → 9 | 9,5 → 11 | 8 → 9,5 | 3,25 → 3,25 |
| 5 | 1,5 | 11 → 10 | 3 → 9 | 2,5 → 7,5 | 1,5 → 3 |
| 6 | 3 | 3 → 4 | 13 → 13 | 11 → 11 | 5,5 → 7,5 |
| 7 | 3 | 2 → 2 | 13 → 13 | 11,5 → 11,5 | 5,75 → 7,25 |
| 8 | 2 | 7 → 8 | 10,5 → 10 | 9 → 8 | 4 → 4 |
| 9 | 3 | 1 → 3 | 13 → 13 | 11,5 → 11,5 | 7,25 → 7,25 |
| 10 | 2,5 | 5 → 6 | 11 → 12 | 9,5 → 10 | 5,5 → 6 |
| 11 | 3 | 4 → 1 | 10,5 → 13 | 9 → 11,5 | 5,25 → 7,75 |

\* Ordem esperada: pontos, BH, BH-1, SB, vitórias incluindo resultados não jogados, progressivo e, para o empate residual, seed como no comportamento determinístico do sistema. O desempate residual entre nº 7 e nº 9 depende dessa última convenção; o primeiro lugar do nº 11 não depende dela, pois seu SB é superior.

Exemplo verificável do nº 11: seus quatro adversários efetivos terminaram com 3, 3, 3 e 1,5 ponto. O bye da R1 contribui com `min(3; 5 × 0,5) = 2,5`. Logo, BH = 13; BH-1 = 11,5; SB = `2,5 + 0,5 × (3 + 3 + 3 + 1,5) = 7,75`. O sistema mostra BH = 10,5; BH-1 = 9; SB = 5,25. Isso muda o primeiro colocado.

#### P2. Progressivo não inclui todas as rodadas após ausência/retirada

- Nº 4: acumulados ao fim de cada rodada = `0; 0,5; 0,5; 1; 1,5`. Soma esperada = 3,5. Gravado = 3. A rodada ausente é omitida em vez de carregar o acumulado.
- Nº 5: acumulados = `0,5; 1; 1,5; 1,5; 1,5`. Soma esperada = 6. Gravado = 3. Após `withdrawn`, seus critérios ficam sem atualização.

#### P3. Contagem de partidas inclui WO como se fosse jogo disputado

Nos nº 1, 2, 3, 6, 7 e 8, o campo `games_played` inclui o WO. Exemplo: nº 6 mostra 5 jogos, mas houve 4 empates no tabuleiro e uma vitória por WO; V/E/D não somam esse WO. É necessário distinguir partidas disputadas, resultados administrativos e vitórias com/sem jogar.

#### P4. TRF perde o adversário de duplo WO

`mapGameCell` em `lib/pairing/trf/serialize.ts` exporta `double_forfeit` como adversário `0000` para os dois jogadores. Com o TRF atual, o checker reporta duas divergências de cor na R1: pares `4–9`/`9–4` e `10–5`/`5–10`.

Teste diagnóstico, sem mudar o banco nem o produto: restaurar somente os dois IDs de adversário do duplo WO no TRF em memória. O checker então percorre as cinco rodadas sem nenhuma discrepância. Isso diferencia perda de informação na exportação de divergência do pareamento efetivamente gerado.

## Estado final

Os dois torneios continuam privados e encerrados. O primeiro não foi modificado pela auditoria. O segundo foi preservado com os resultados e cálculos produzidos pelo sistema, inclusive as divergências, para reprodução. Nenhuma correção de produto ou migration foi feita nesta tarefa.
