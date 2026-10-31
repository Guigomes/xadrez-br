# Encerrar e preparar a próxima rodada

## Fluxo

- Encerramento confirmado no painel de resultados leva à aba Rodadas com o
  grupo correto e `prepare=<próximo número>`, não com o id da rodada encerrada.
- Encerrar pela própria aba recolhe o card encerrado e seleciona o preparo.
- “Preparar rodada 2” recebe foco/scroll quando os dados confirmam a liberação;
  a seção mantém a marcação de ausências e o botão de gerar. Não gera sozinha.
- Rodadas anteriores não são apagadas nem escondidas do histórico: seus chips
  continuam disponíveis para consulta explícita.
- Rascunho recém-gerado abre automaticamente; recarregar `prepare=2` quando a
  rodada 2 já existe abre essa rodada, não uma seção vazia.
- Abrir a aba sem selecionar histórico, entre rodadas, também prioriza preparar
  a próxima. O grupo é restaurado pela URL; trocar de grupo não carrega a seleção
  de outro grupo.
- Limite de rodadas por grupo respeitado; após terminar o torneio, o painel
  continua navegando para a classificação.
- Estado de preparo é numérico, separado do id da rodada: dados em cache ainda
  mostrando a rodada anterior em andamento não a reabrem durante a transição.
- Foco/scroll dependem de valores primitivos, sem repetição a cada polling;
  movimento reduzido é respeitado.

## Verificação

Suíte completa: **458 testes em 53 arquivos**, sem falhas; TypeScript sem
erros. Lint sem erros, somente avisos preexistentes de `any` nos componentes
administrativos. `git diff --check` sem erro de whitespace.

Regras de seleção/URLs: `lib/utils/__tests__/round-navigation.test.ts`.
Renderização real da aba: `lib/__tests__/round-player-details.test.ts` cobre
card anterior recolhido, histórico consultável, categoria restaurada, próxima
rodada em preparo, rascunho após gerar/recarregar e ausência de geração automática.
`result-card-layout.test.ts` continua verificando o painel e seus controles.

Sem migration, alteração de resultados ou teste destrutivo em torneios reais.
Publicação autorizada pelo dono em 2026-10-31, junto com os ajustes de
peões/rating/pontos. Publicar via `main` e aguardar confirmação do CI/deploy.
Validação visual em navegador/celular permanece pendente; os testes de
renderização não equivalem a essa prova.
