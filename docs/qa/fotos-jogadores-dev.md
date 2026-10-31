# Fotos de jogadores — associação privada pelo Dev

## Escopo

**Pedido posterior — pódio:** a restrição de não exibir permanece para perfis, mesas e demais telas, mas o pódio de torneios encerrados pode agora exibir fotos dos seus até três premiados via proxy de leitura validado no servidor. O bucket não se torna público, gestão continua só Dev e não há URL assinada. Ver `docs/qa/podio-animado.md`; as declarações de ausência de download/exibição abaixo descrevem a entrega original isolada.

- Entrada: `/admin/dev` → **Fotos dos jogadores**, em `/admin/dev/fotos-jogadores`.
- Buscar por nome/CBX/FIDE, conferir os IDs, escolher um arquivo e associar/substituir.
- Nenhuma foto é renderizada nesta tela, nem mesmo como prévia no Dev. O pedido posterior de pódio autorizou leitura limitada dos premiados em torneios encerrados pelo proxy descrito em `podio-animado.md`, sem URL pública/assinada do Storage.
- A associação é global e determinística: bucket privado `player-photos`, objeto `<players.id em minúsculas>/photo.webp`. O mesmo jogador não recebe fotos separadas por torneio. Nenhuma coluna, RPC pública ou resultado muda.
- Entrada estática JPG/PNG/WebP, até 3 MiB e 25 megapixels; decodificada e recodificada em WebP, até 800×800 sem ampliar, com orientação corrigida e EXIF/GPS removidos. SVG, GIF, arquivos falsos e imagens animadas são rejeitados.
- API `GET/PUT /api/admin/players/[playerId]/photo`: valida sessão com `getUser` e `user_profiles.role=admin` antes de criar cliente privilegiado. GET retorna só existência/data. PUT aceita apenas arquivo, não URL/path de armazenamento fornecido pelo cliente.
- O Storage nega leitura/escrita direta para `anon/authenticated`, mesmo para um Dev autenticado; somente a API protegida usa `service_role`. Policy restritiva não interfere em outros buckets.

## Etapa atual

Publicação solicitada. Migration `20261031144822` aplicada e registrada; 139 arquivos/139 registros conferidos. Bucket privado com 3 MiB e somente WebP, policy restritiva confirmada. Tipos, lint (avisos preexistentes) e 590 testes/64 arquivos passaram. Nenhuma foto real foi enviada. Validação visual/upload autenticado ainda não confirmados.

## Antes de publicar

1. `npx vitest run lib/__tests__/player-photos.test.ts lib/__tests__/player-photo-image.test.ts`, tipos e lint; depois suíte completa.
2. Revisar e aplicar `20261031144822_player_photos_private_storage.sql` via `scripts/apply-sql.mjs`, conferir `scripts/check-migrations.mjs`. Sem geração de tipos: a migration só cria bucket/policy no schema Storage, sem alterar `public`.
3. Conferir `storage.buckets`: `public=false`, limite 3145728, MIME `image/webp`; `pg_policies`: policy `player-photos: server only` restritiva para SELECT/INSERT/UPDATE/DELETE, sem mudar as permissões dos outros buckets. Executar advisors e comparar com a linha de base preexistente.
4. Exercitar anon e conta organizadora/árbitro: GET/PUT devem retornar 401/403 antes de qualquer escrita. Testar tentativa direta de listar/enviar/baixar no bucket com JWT sem privilégio: negada. Não usar foto real para esses testes.
5. Com o Dev, usar jogador de auditoria e imagem sintética: associar e substituir; verificar exatamente um objeto no prefixo desse UUID. GET deve retornar só status/data e nenhuma URL. Conferir que outro jogador continua inalterado. Não usar pessoa real sem autorização.
6. Na tela: digitação, seleção inequívoca por IDs, status inicial, substituição, arquivo inválido, falha de rede e nova tentativa; nenhuma falsa confirmação ou imagem deve aparecer. A seleção e o envio ficam bloqueados durante upload; em falha, o arquivo fica disponível para tentar novamente.
7. Não exibir fotos em perfis, participantes, rodadas ou classificação. Na TV, somente o pódio de torneio realmente encerrado pode ler fotos dos seus premiados, conforme o pedido posterior.

## Compatibilidade e reversão

Aplicar Storage antes do deploy. Código antigo ignora totalmente o bucket novo; novos endpoints falham de forma explícita se o armazenamento não estiver configurado. Reaplicar a migration é idempotente; configurações incompatíveis em bucket preexistente fazem rollback, sem alterar silenciosamente sua privacidade.

Para reverter: retirar a tela/link e a API, **preservando** bucket, policy e arquivos. Não apagar um bucket populado nem converter para público. Substituição é intencional e troca o único arquivo do jogador; não há histórico de versões nesta entrega. Exclusão de jogadores pode deixar objetos privados órfãos, preservados para limpeza futura explícita via Storage API — nunca deletar linhas de `storage.objects` diretamente.
