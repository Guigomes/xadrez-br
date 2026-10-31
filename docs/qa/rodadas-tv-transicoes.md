# Rascunho e apresentação entre rodadas

Alterações de 31/10/2026. Publicação solicitada: 590 testes/64 arquivos passaram com um worker, tipos e lint passaram (avisos preexistentes). Nenhuma rodada/resultado alterado durante os testes. Navegador local expirou; validação visual ainda não confirmada.

## Comportamento

- Ao voltar a última rodada suíça para rascunho, **Marcar ausência** fica dentro do próprio card da rodada, inclusive na última rodada prevista. Não aparece um painel enganoso de preparação da rodada seguinte. Alterar ausências exige atualizar o emparceiramento antes de republicar; o aviso de substituição das trocas manuais permanece. Rodada publicada continua sem edição das suas ausências. Rodízio/Berger não ganha esse editor.
- A TV usa `status=finished` da rodada publicada para avisar o encerramento e manter a classificação visível até a próxima publicação. Todos os resultados preenchidos não encerram a rodada automaticamente.
- A preferência Só rodada/Alternar é mantida para a próxima publicação. Alternar recomeça pelas mesas da nova rodada; escolher Só classificação continua respeitado. Pódio final permanece uma escolha explícita.
- Entrada de uma nova publicação e troca de visualização têm fade/deslocamento de 900 ms, antes da pintura. Atualizações comuns dos resultados não reiniciam a animação, a rolagem ou os cards. Republicação da mesma rodada com novo `published_at` conta como nova entrada. Redução de movimento desativa a animação.
- A região rolável passa de 18 para **26 px/s**, mantendo 4 s de leitura inicial e 5 s finais; pausa e proteção contra saltos após ficar em segundo plano permanecem.
- A classificação fica centralizada, com largura máxima e padding responsivo. Nomes completos, posições/pontos oficiais e separação por grupo são preservados.
- Pódios parciais não desenham posições inexistentes; ver `podio-animado.md`.

## Validação a executar quando solicitada

1. Testes focados: `round-player-details`, `tv-presentation`, `tv-playback`, `tv-display`, `tv-page`, `tv-podium` e `podium`; tipos/lint e suíte completa após pedido de teste/publicação.
2. Torneio de teste suíço: voltar a primeira e a última rodada para rascunho; marcar/desmarcar ausência, conferir aviso, atualizar pareamento e republicar. Confirmar que a confirmação de exclusão de resultados permanece obrigatória quando aplicável. Não usar torneio real para esse teste destrutivo.
3. TV em outro navegador: lançar todos os resultados sem encerrar (mesas continuam); encerrar (aviso + classificação); gerar rascunho seguinte (mantém classificação); publicar (nova rodada entra suavemente). Repetir em Só rodada/Alternar/Só classificação e com redução de movimento.
4. Atualizar placares enquanto rola: sem flash/reset, com animações individuais preservadas. Testar republicação, pausa manual, segundo plano e larguras de celular/TV Full HD.

Sem novas assinaturas Realtime, políticas de acesso, alterações de cálculo ou migrations para esses ajustes.
