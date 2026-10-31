---
title: Conceitos básicos de xadrez e de torneio
audience: ambos
slug: conceitos-basicos-de-xadrez-e-torneio
---

Vocabulário geral de torneio de xadrez, pra quem é novo no assunto — os
outros documentos assumem que esses termos já são conhecidos.

## Pontuação de uma partida

Vitória vale 1 ponto, empate vale meio ponto (0,5) pra cada lado, derrota
vale 0. A classificação de um torneio é a soma dessa pontuação ao longo de
todas as rodadas.

## Sistema suíço

É o formato de pareamento mais comum em torneios com muitos jogadores e
poucas rodadas (o contrário de todos-contra-todos, que exigiria uma rodada
por adversário). A cada rodada, o sistema junta jogadores com pontuação
parecida, evitando repetir um confronto já feito e equilibrando quem jogou
mais vezes de brancas ou de pretas. Este sistema usa a variante oficial da
FIDE (regra "Dutch").

## Mesa

Cada confronto de uma rodada é chamado de mesa — um jogador de brancas,
um de pretas (ou uma mesa de bye, ver abaixo). O número da mesa é só uma
referência de organização, não indica importância.

## W.O. (walkover)

Quando um jogador não aparece pra jogar sua mesa, o resultado lançado é
W.O. — o presente vence a mesa. Se os dois faltarem, é W.O. duplo (mesa
perdida pelos dois lados, ninguém pontua).

## Bye — dois tipos diferentes neste sistema

**Bye de pareamento**: acontece sozinho, sem ninguém pedir, quando o grupo
tem número ímpar de jogadores ativos numa rodada — o sistema de pareamento
sobra um jogador sem adversário e dá 1 ponto cheio pra ele (equivalente a
uma vitória), sem jogar.

**Bye solicitado**: é quando um jogador avisa com antecedência que não vai
jogar uma rodada específica (viagem, compromisso, etc.). O organizador
marca isso na aba Rodadas, na seção "Ausências na rodada", **antes** de
gerar o pareamento daquela rodada — o jogador marcado não entra no sorteio
de mesas. Se o organizador habilitou meio ponto (`requested_bye_score = 0.5`),
recebe 0,5 ponto somente na primeira rodada. Da segunda rodada em diante,
recebe sempre zero; com a opção de zero pontos, recebe zero em todas as rodadas.
Byes e resultados já registrados não são alterados automaticamente por essa regra.
A diferença central pro
bye de pareamento: este é um pedido do jogador, feito antes da rodada
existir, e não concede o ponto inteiro do bye de pareamento.

## Rating

Número que estima a força de um jogador (quanto maior, mais forte) — usado
pra ordenar o ranking inicial (seed) antes da primeira rodada e para
critérios de desempate que dependem da força dos adversários enfrentados.
Pode ser editado manualmente pelo organizador a qualquer momento (ver
documento "Participantes").
