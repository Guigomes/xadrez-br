# Pódio animado após o encerramento

## Entrega local

- A classificação final ganha **Apresentar pódio na TV**, abrindo `/torneios/<slug>/painel?exibir=podio`.
- A TV oferece **Pódio · premiação** apenas quando o status armazenado do torneio é `finished`. Não usa a inferência cosmética de encerramento nem a mera existência de resultados. Torneios não listados continuam acessíveis por link, como definido pelo produto.
- O modo de premiação usa uma tela mais livre, sem o grande cabeçalho/QR da chamada, com nome do torneio e seu logo autorizado quando houver. A conexão ao vivo permanece montada; não interfere na alternância/rolagem dos outros três modos nem desmonta suas mesas.
- Selecionar Absoluto, categoria ou Feminino (se configurado), sempre dentro do grupo de emparceiramento. Nunca comparar posições 1 de grupos distintos como se houvesse um ranking global. O recorte replica `StandingsView`: absoluto desativado só reaparece como fallback quando não há categorias. A fonte é `get_tournament_standings`; nenhum resultado ou desempate é recalculado pelo navegador.
- Sem rank final conhecido, não inventar campeão por rating/seed/pontos. Menos de três posições confirmadas mostra apenas os premiados disponíveis, **sem degraus nem colunas vazias**, centralizados; zero posições não desenha pódio.
- **Iniciar/Repetir apresentação**: bronze em 1,5 s, prata em 6 s, ouro em 10,5 s; com um/dois premiados, começa no último lugar existente em 1,5 s e revela os demais a cada 4,5 s, sem esperas por lugares vazios. Subida suave em 1,8 s, degraus metálicos, troféu e confetes finitos. Disposição visual 2–1–3 apenas nas posições existentes. Não começa sozinho ao montar/atualizar; uma troca de categoria/premiados reinicia, e sair cancela os timers.
- **Mostrar pódio completo** pula a animação. `prefers-reduced-motion` revela imediatamente todos e desliga os efeitos. Nomes completos quebram linha; nenhuma biblioteca nova, som ou efeito infinito.

## Exceção deliberada às fotos privadas

O novo pedido autoriza exibir foto **no pódio**, não nos demais locais. As fotos continuam no bucket privado da entrega Dev anterior. O endpoint público de leitura `/api/tournaments/<slug>/podium-photo?category=<opção>&player=<uuid>`:

1. Usa cliente Supabase anônimo sem cookies para confirmar que o evento é visível e está realmente `finished`.
2. Recalcula apenas o recorte da classificação oficial, com o mesmo helper usado na tela, e verifica que o UUID é um dos até três premiados dessa opção.
3. Só então cria cliente privilegiado e baixa o objeto canônico `<uuid>/photo.webp`.
4. Retorna somente bytes WebP com `private, no-store`, nunca URL pública/assinada ou chave. Ao reabrir o torneio, novas leituras são negadas. Não permite escolher outro bucket/path, consultar toda a galeria ou escrever fotos.

Imagem ausente, falha no download ou bucket ainda não configurado resulta no peão branco já existente. O peão aparece enquanto a foto carrega e permanece em erro. Dev continua sendo o único capaz de enviar/substituir fotos. Não tornar o bucket público e não mexer na policy restritiva para implementar a exibição.

## Verificação

Publicação solicitada em 31/10/2026: 590 testes/64 arquivos, tipos e lint passaram (avisos preexistentes). Migration de fotos aplicada e registrada, 139/139 conferidas. Navegador local expirou; não declarar animação/foto aprovada visualmente sem inspeção posterior. Nenhuma foto real enviada nem classificação alterada.

1. `npx vitest run lib/tournament/__tests__/podium.test.ts lib/__tests__/podium-photo-route.test.ts lib/__tests__/tv-podium.test.ts lib/__tests__/tv-display.test.ts lib/__tests__/tv-page.test.ts`, tipos e lint, depois suíte completa.
2. Validar no navegador: torneio em andamento não oferece pódio nem aceita a URL direta; encerrado oferece. Trocar grupo/categoria, iniciar, esperar 1,5/6/10,5 s, repetir e pular. Atualização ao vivo idêntica não reinicia; reabertura remove a opção. Exercitar redução de movimento e telas pequenas/TV.
3. Exercitar sem foto, imagem real de auditoria, 404 e erro de rede. Não enviar nem expor foto de uma pessoa real para testar sem autorização. Nenhum dos endpoints de gestão fica acessível ao público.
4. Testar foto de não premiado, outro grupo, categoria desconhecida/desativada, UUID/path inválido e torneio draft/ongoing/cancelled: 404 antes do cliente privilegiado. Conferir `no-store` e não alterar outras permissões do Storage.
5. Não há migration nova de pódio; fotos usam `20261031144822_player_photos_private_storage.sql` da entrega Dev, já aplicada/registrada antes da publicação. Foto ausente usa peão. Nenhum upload real foi executado.
6. Categorias com zero, um ou dois premiados: sem degraus vazios; nomes/fotos existentes centralizados, introdução cita o último lugar disponível. Iniciar/repetir não espera um bronze inexistente.

## Reversão

Remover a opção/link/componentes e o proxy de leitura do pódio. Preservar todas as classificações, fotos e a policy privada; nenhum backfill ou alteração de dados faz parte desta entrega.
