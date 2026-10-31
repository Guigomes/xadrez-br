# Peões, escolhas de resultado e dados do jogador

## Implementado

- `piece-icons.tsx` usa os dois PNGs gerados (branco/preto) por meio do
  Next/Image: tamanhos de exibição pequenos, transparência e otimização padrão,
  sem baixar o PNG de 1254 px em cada card. Arquivos necessários para publicar:
  `public/images/chess-pieces/pawn-white-v1.png` e `pawn-black-v1.png`.
- Painel do árbitro pergunta “Quem venceu?”; opções Brancas / Empate / Pretas
  mostram o placar menor embaixo. Alvos de toque de no mínimo 56 px; WO e Limpar
  continuam secundários e acessíveis, assim como o filtro de mesas pendentes.
- Os nomes continuam completos, um por linha; o vencedor recebe cor/destaque
  e um troféu maior.
- `PlayerScoreSummary` exibe rating e pontos atuais acumulados abaixo do nome
  no painel, na lista de rodadas do organizador, nas rodadas públicas e na TV.
  Pontuação zero é visível; rating ausente/zero mostra “Sem rating”; pontuação
  ausente mostra “Pontos —”, sem inventar zero. Meio ponto aparece como “½”,
  não “0½”. BYE não é um adversário com rating/pontos fictícios.
- Reutiliza `white_rating`, `black_rating`, `white_score` e `black_score` já
  retornados pela consulta. Não muda cálculo de pontos, rating, RPCs, permissões
  ou regra de pontuação. O total acumulado não é o placar da partida.
- Resposta otimista, rollback em erro, bloqueio durante salvamento, PGN na lista
  de rodadas e animação da TV foram preservados.

## Verificação

- **438 testes em 52 arquivos** passaram.
- TypeScript: zero erros.
- Lint dos arquivos da alteração: zero erros; somente avisos preexistentes de
  `any` no painel e na lista administrativa. Novos componentes/testes sem avisos.
- `git diff --check` sem erro de whitespace.
- Testes de renderização: `result-card-layout`, `tv-pairing-card`,
  `round-player-details` (lista nativa e pública), `player-score-summary`.
- Os testes conferem nomes completos, arquivos de imagem existentes, escolha
  correta da cor, miniaturas otimizadas, rating/pontos por jogador, zero, meio
  ponto, dados ausentes, BYE e manutenção dos controles de resultado.

## Publicação

Publicação autorizada pelo dono em 2026-10-31, junto com o fluxo de preparação
da próxima rodada. Suíte combinada: 458 testes em 53 arquivos. Não há migration
nova. Os dois PNGs e `docs/design/peoes-gerados.md` acompanham o código no mesmo
commit. Os demais arquivos locais sem relação ficam fora da publicação.
Validação visual em navegador/celular com torneio de teste ainda pendente;
os testes de renderização não equivalem a essa prova visual.
