# Duas trilhas locais para o pódio

Publicação solicitada pelo usuário. Mantida a dispensa anterior de testes locais; código, casos de regressão e assets preparados, sem execução local. Preservadas as verificações automáticas existentes no CI. Sem migration ou nova dependência.

## Escopo

- Seletor **Música do pódio**: Sem música (padrão), Take On Me · Brooklyn Duo e Trilha para apresentação · jv808tp.
- Os dois MP3 autorizados pelo usuário, extraídos na etapa anterior, foram copiados de `../podium-audio/` para `public/audio/podium/`, sem recodificar novamente. Arquivos somam aproximadamente 8,1 MB. Na publicação, serão assets estáticos servidos pelo próprio site; não são objetos privados.
- Substitui integralmente o rascunho de integração YouTube. Sem vídeo, iframe, SDK, API key, cookies ou requests ao YouTube para tocar. Não confundir assets locais do site com acesso offline garantido: o MP3 ainda precisa ser carregado.
- Controles recolhíveis acima dos botões da cerimônia. Volume inicial 25%, áudio nativo com controles, loop, tocar/pausar separados. Recolher não desmonta/interrompe o áudio.
- Selecionar uma faixa não inicia reprodução: `preload=none`, sem `autoplay`. Iniciar/repetir chama `play()` no clique, reinicia a faixa e recolhe os controles para liberar o pódio. Se o navegador/rede bloquear, reabrir controles com mensagem; a premiação continua sem esperar o áudio.
- Trocar faixa pausa/libera a anterior; categoria/premiados diferentes pausam e preservam escolha/volume. Mostrar o pódio completo não corta a trilha. Sem música ou sair do pódio pausa e libera a mídia. Refresh idêntico não reinicia nada.
- Promessas antigas de reprodução não devem gerar alertas depois de uma pausa, troca ou saída. Cleanup cancela mídia pendente e restaura corretamente o `src` no ciclo de desenvolvimento Strict Mode.
- Habilitação só neste painel/apresentação; não persistir som ou ativar para outros espectadores/torneios. Não alterar dados, classificação ou fotos.

## Validação preparada

1. `podium-music.test.ts`: exatamente dois MP3 locais presentes, play imediato no clique, reinício do tempo na cerimônia, retomada sem reinício, falha/bloqueio e pausa tolerantes a erro.
2. `tv-podium.test.ts`: três opções do seletor, padrão Sem música, controles recolhidos, nenhum audio/video/iframe/SDK na renderização inicial; manter regras de pódios com zero/um/dois/três premiados.
3. Quando autorizado testar: verificar desktop/mobile, ambas as faixas, volume/controles nativos, reiniciar cerimônia, recolher, trocar categoria/faixa e sair sem som residual. Considerar que alguns aparelhos controlam volume pelo sistema, não por script.
4. Simular bloqueio de play, erro de rede e troca enquanto carrega: não bloquear a animação, não mostrar alerta atrasado de uma mídia já descartada. Testar Strict Mode e refresh idêntico.
5. Incluir os dois arquivos de `public/audio/podium` no mesmo commit do código. Não publicar só os caminhos sem os arquivos.

Reversão: retirar controles/componente/assets desta entrega. Nenhum cadastro, classificação, foto ou dado de torneio deve ser removido.
