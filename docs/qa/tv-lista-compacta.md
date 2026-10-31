# Rodada da TV em lista compacta

Pedido: a foto de uma TV com nove mesas mostrou cards grandes, nomes quebrados em várias linhas e espaço excessivo no cabeçalho. Alteração restrita à apresentação do painel: uma mesa por linha, cabeçalhos compartilhados Mesa/Brancas/Resultado/Pretas, nomes completos sem reticências, peões menores, rating/pontos e vencedor em negrito com troféu.

Cabeçalho, logo, QR e barra de apresentação mais compactos. Em tela estreita, os jogadores ficam empilhados na mesma linha de mesa, com o resultado ao lado. A altura pode aumentar para acomodar nomes longos; listas maiores continuam com a rolagem automática existente. Não forçar caber removendo nomes ou reduzindo dinamicamente a fonte.

Sem alteração de consultas, resultados, permissões, classificação, pódio ou áudio. Mantidos IDs/chaves, detecção de vitória, entrada da rodada, preferência de movimento reduzido e ciclo de reprodução.

Regressões preparadas (não executadas nesta etapa): `tv-page.test.ts` cobre nove mesas em lista única, na ordem recebida; `tv-pairing-card.test.ts` cobre a estrutura compacta e destaque do vencedor, além dos casos existentes de nomes, rating/pontos, W.O., bye e não emparceirado.

Quando houver pedido de validação: conferir 1920×1080, 1366×768 e celular, nove mesas e lista longa, nomes extensos, QR, resultado chegando ao vivo, animações, pausa/rolagem/alternância e transição para classificação ao encerrar. Verificar que a região de conteúdo rola sem deslocar os controles. Não alterar torneios reais para testar.

Publicação solicitada pelo usuário, com dispensa da prévia. Sem testes/build locais ou migration; preservar os gates automáticos existentes no CI e acompanhar o deploy. A tentativa de abrir a página local entrou em redirecionamento repetido: não equivale a aprovação visual ou validação ao vivo. Reversão: restaurar apenas os estilos/estrutura anteriores do painel; nenhum dado precisa ser revertido.
