# Excluir participante pelo editor

Publicação solicitada sem testes locais por instrução explícita do usuário. O pipeline existente mantém suas verificações automáticas. Código/testes preparados; nenhuma exclusão real ou migration faz parte do deploy. Música do pódio fora desta publicação.

## Regras

- Aba administrativa Participantes de torneios nativos → Editar → **Excluir participante**.
- Confirmação separada, com nome salvo do participante (não o nome digitado e ainda não salvo), opção de voltar e aviso de descarte das alterações não salvas.
- Remove somente `tournament_players.id` **e** `tournament_id` identificados. Não apagar `players`, rodadas, partidas, cadastro em outros torneios, inscrições ou pagamentos; não iniciar estorno.
- Usar cliente autenticado e RLS existente `tp_manage`, sem service_role, RPC privilegiada ou ampliação de permissão.
- FKs existentes `pairings_white_tp_id_fkey`/`pairings_black_tp_id_fkey`, ambas sem cascade, impedem apagar qualquer participante com partidas, incluindo rascunho/bye. Não remover partidas para viabilizar exclusão: informar o bloqueio e orientar ausência futura.
- Sem partidas: snapshots de classificação e byes pedidos desse vínculo seguem as cascatas já existentes. Inscrição anterior é preservada com vínculo nulo (`ON DELETE SET NULL`); não mudar seu status, valores ou pagamentos.
- Validar a linha retornada pelo DELETE para não dar falso sucesso em RLS, ID inexistente ou outro torneio. Sem retry automático.
- Falha mantém a confirmação aberta; Voltar preserva valores digitados. Durante envio, impedir fechamento/retorno/nova ação e esperar confirmação do banco, sem remoção visual otimista.
- Atualizar caches de participantes, classificação, listas, inscrições e byes pedidos somente após sucesso.

## Validação a executar após pedido de teste/publicação

1. `delete-tournament-player.test.ts`: escopo dos dois filtros, nenhuma exclusão global/partida, sucesso com invalidation, erro de FK, RLS/zero linhas, falha de servidor e alvo vazio. Tipos/lint e suíte completa.
2. Navegador, torneio nativo de auditoria: abrir Editar, digitar nome diferente e pedir exclusão; confirmar aviso usa nome salvo. Voltar conserva o texto; cancelar não altera dados.
3. Participante de auditoria sem partidas: confirmar e conferir saída da lista/contagem e cadastro global ainda presente. Não usar pessoa real em teste destrutivo.
4. Participante com rascunho, partida publicada, bye ou resultado: exclusão bloqueada, partida e resultado íntegros. Nenhum request DELETE para `players`/`pairings`.
5. Simular 403, zero linhas e erro de rede: não fechar com falso sucesso; impedir duplo envio/fechamento durante pendência e permitir correção depois da falha.
6. Confirmar que cadastro novo/importado não oferece o botão, e que a permissão do gerente de outro torneio não permite deletar este vínculo.

Reversão de código: retirar botão/hook. Não há exclusão automática nem alteração de banco para executar ao publicar. Recriar um participante apagado gera outro vínculo; não há desfazer automático.
