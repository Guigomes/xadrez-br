---
title: Classificação e Emparceiramento — a diferença entre os dois
audience: organizador
slug: classificacao-e-emparceiramento
---

Essas duas palavras parecem sinônimas mas resolvem problemas diferentes, e
confundir uma com a outra é o erro mais comum na hora de configurar um
torneio.

## Classificação — quem disputa prêmio com quem

Classificação é o **ranking de premiação**. Cada jogador cai numa faixa (ou
só no "Geral", se nenhuma faixa for configurada). Ela é montada respondendo
três perguntas, na aba de criação do torneio (ou depois, na aba Editar):

- Tem classificação separada por idade? (ex: Sub-9, Sub-11, Sub-17...)
- Tem classificação separada por rating? (ex: até 1200, até 1600...)
- Tem classificação feminina?

Essas dimensões se cruzam: idade + feminina gera, por exemplo, "Sub-17" e
"Sub-17 Feminino" como classificações separadas — não uma "Feminino" avulsa
misturada com os meninos daquela faixa. Só feminina marcada (sem idade)
gera uma única "Feminino" geral.

Rating **não é pedido no formulário de inscrição** — se o torneio usa
classificação por rating, o organizador precisa preencher o rating de cada
jogador manualmente na aba Participantes, senão ninguém cai nas faixas de
rating.

Depois de marcar as opções, o botão "Salvar classificações" cria de fato as
categorias no banco. A cada inscrição aprovada, o sistema classifica o
jogador automaticamente pelos dados dele (ano de nascimento, rating, sexo).

## Emparceiramento — quem joga contra quem

Emparceiramento é o **pareamento**, ou seja, quem enfrenta quem no
tabuleiro a cada rodada. Tem aba própria, separada de Classificação, e
oferece quatro opções:

- **Absoluto** ("Não — todos juntos"): um grupo único, todo mundo joga no
  mesmo torneio. As classificações continuam valendo pra premiação, só o
  pareamento é junto.
- **Por idade**: um grupo por faixa de idade — cada faixa vira um torneio
  separado, com rodadas próprias. As demais classificações (rating,
  feminina) viram recorte de premiação dentro de cada grupo.
- **Por rating**: mesma lógica, um grupo por faixa de rating.
- **Personalizado**: o organizador cria os grupos manualmente e mapeia cada
  classificação a um grupo. É a opção mais flexível, mas também a única que
  não gera nada sozinha — group e mapeamento precisam ser feitos na mão
  antes de publicar.

Todo torneio nasce com emparceiramento **Absoluto** (grupo "Absoluto")
automaticamente na criação — trocar pra por idade/rating/personalizado é
uma decisão que se toma depois, na aba Emparceiramento, a qualquer momento.

## Por que o torneio às vezes não deixa publicar

Se o emparceiramento estiver em "Personalizado" e não tiver nenhum grupo
criado, ou tiver classificação sem grupo mapeado, o botão "Publicar" fica
desabilitado com um aviso. Isso existe porque um torneio nativo não aceita
participante sem grupo definido — sem essa trava, a primeira inscrição
aprovada daria erro.
