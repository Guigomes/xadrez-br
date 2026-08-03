---
title: Ciclo de vida de um torneio
audience: organizador
slug: ciclo-de-vida-torneio
---

Todo torneio passa por uma sequência de status, na ordem: rascunho, publicado,
inscrições abertas, inscrições encerradas, em andamento, encerrado. Existe
também "cancelado", que é um desvio possível a partir de quase qualquer ponto.

## Rascunho (draft)

É o estado inicial, logo depois de "Criar torneio". Nesse estado o torneio
**não aparece pra ninguém além do organizador** — nem na busca pública, nem
por link direto. É a hora de revisar as informações básicas, decidir a
Classificação (idade, rating, feminina) e configurar o Emparceiramento (aba
própria, separada da Classificação).

O botão "Publicar" fica desabilitado se o emparceiramento estiver marcado
como "Personalizado" e ainda não tiver grupo criado ou classificação sem
grupo mapeado — isso evita publicar um torneio que vai travar na primeira
inscrição aprovada.

## Publicado (published)

Depois de clicar "Publicar", o torneio já aparece na busca pública e por
link direto, mas o formulário de inscrição ainda não abre — quem visita a
página vê as informações, mas não consegue se inscrever ainda. Esse estado
serve pra divulgar o torneio antes de liberar inscrições.

## Inscrições abertas (registration)

Clicando em "Abrir Inscrições", o formulário público fica disponível e o
link de inscrição (aba Inscrições) passa a funcionar. Antes disso, a aba
Inscrições mostra uma mensagem avisando que as inscrições precisam estar
abertas.

Se o torneio tiver uma data de encerramento de inscrição configurada, o
status muda sozinho pra "Inscrições encerradas" quando essa data chega —
não precisa de ação manual, mas o organizador também pode encerrar na mão
a qualquer momento com o botão "Encerrar Inscrições".

## Inscrições encerradas (registration_closed)

O formulário público para de aceitar novas inscrições. O organizador ainda
pode reabrir ("Reabrir Inscrições") se precisar, ou seguir pra "Iniciar
Torneio" quando estiver pronto pra gerar a primeira rodada.

## Em andamento (ongoing)

O torneio já tem pelo menos uma rodada gerada. A partir daqui, inscrições
aprovadas entram como **entrada tardia**: o jogador recebe bye (0 pontos)
nas rodadas já disputadas do grupo dele, e passa a jogar normalmente a
partir da próxima rodada.

Se o torneio tiver horário de início configurado, a data completa (data +
horário) é o que decide quando o status muda sozinho pra "em andamento" —
não só a data.

No dia em que o torneio foi criado, essa troca automática não acontece —
mesmo que a data de início ou de encerramento de inscrição já tenha
passado (torneio cadastrado depois, com datas retroativas). O status
inicial fica por conta do organizador; o relógio automático só passa a
vigiar a partir do dia seguinte à criação.

## Encerrado (finished)

Estado final, depois de "Encerrar Torneio". Não há mais ação de status a
tomar; a classificação final fica disponível pra consulta/impressão.

## Cancelado (cancelled)

Interrompe o torneio sem apagar nada — participantes, rodadas e resultados
continuam no banco. Dá pra reativar depois (volta pro estado de rascunho).
Diferente de excluir, que é permanente e remove tudo.
