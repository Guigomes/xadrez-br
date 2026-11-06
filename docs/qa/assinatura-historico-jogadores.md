# Histórico completo — Jogador+

Preço definido pelo proprietário: **R$ 4,99/mês**. Cobrança recorrente pela integração Asaas já existente, sem novo provedor. É a conta que consulta que precisa da assinatura: ela pode consultar diferentes jogadores, sem cobrança por jogador consultado.

## Escopo

- Perfil básico (nome, ratings, identificadores) e resultados individuais de torneios permanecem gratuitos. Não foram alteradas as regras públicas das tabelas de torneios/partidas nem a leitura de PGN por torneio para logados.
- O produto pago é o **histórico consolidado no perfil do jogador**, incluindo a visão de adversários e desempenho. Resultados públicos ainda podem ser consultados/compilados separadamente; esta não é uma promessa de sigilo sobre resultados públicos.
- A função `get_player_history(uuid)` exige conta registrada e assinatura `active` de plano com `player.full_history` habilitado. Login sozinho, `user_profiles.plan_id` sozinho, checkout pendente, vencido ou cancelado não bastam. Dev/Admin é isento.
- Jogador+ não concede `organizer.large_tournaments`: o limite de 20 participantes continua independente.
- A matriz inicialmente inclui histórico em Organizador/Plus/Pro/Federação, seguindo a inclusão dos recursos de jogador nos planos superiores. A inclusão no Organizador foi perguntada ao proprietário; ajustar essa linha antes da publicação se preferir cobrança separada.
- A nova regra usa `player_history_billing_enabled=true`. **Não ligar `billing_enabled` global** nem cobrar outros recursos nesta etapa.

## Proteção e compatibilidade

- Guard no RPC, não apenas no componente. Mesmo assinatura de outro usuário não serve. Usuários anônimos do Supabase também são recusados.
- Helper privado sem EXECUTE para PUBLIC/anon/authenticated. Nenhuma nova RPC pública; a assinatura e as 20 colunas de `get_player_history` são mantidas, sem editar types gerados.
- A verificação da interface usa apenas cliente de sessão/RLS, não service role. A API retorna decisão de acesso e oferta pública, nunca identidade, fatura ou dados de outro assinante; `private, no-store`.
- Query de histórico/cache separados por conta. Histórico em cache não é renderizado com conta gratuita, logout ou negação atual do banco. Verificação de acesso atualiza a cada 30 segundos; erro de rede exibe tentativa novamente, não um falso convite de compra.
- `/planos`/checkout reconhecem os dois lançamentos independentes. O preço efetivamente cobrado continua vindo do servidor, com estados e proteção contra duplicidade da assinatura de organizador. Webhook confirmado ativa; atraso/cancelamento revoga o acesso.

## Publicação e reversão

Ainda não aplicado em produção. Aplicar primeiro a migration de Organizador e depois `20261102130414_player_history_subscription.sql`, pelo procedimento do repositório, conferir R$ 4,99/mês na vitrine e checkout, configurar eventos Asaas e publicar o código. A migration transforma o plano oculto/sem preço `player` na oferta pública Jogador+, preservando preços operacionais existentes em reaplicações.

Rollback não destrutivo: `update public.app_settings set value='false'::jsonb where key='player_history_billing_enabled';`. Volta a permitir histórico completo para contas registradas e remove a oferta seletiva do Jogador+. Não apaga partidas, planos, pagamentos ou assinaturas; **não cancela recorrências na Asaas**.

## Provas

- Vitest: `player-history-subscription`, `player-history-access-route`, `player-history-paywall`, `player-history-cache`; checkout em `organizer-checkout` inclui preço mensal R$ 4,99, estado pendente e separação de planos.
- SQL real isolado: `node scripts/test-organizer-subscription.mjs <diretório-externo-com-pglite-0.5.14>`. São 51 verificações combinadas. Compara todas as linhas/colunas/valores do RPC antigo e novo para assinante, com partidas de ambas as fontes (ao vivo e arquivo), testa falta de perfil, JWT anônimo, preço/ciclo, estados da assinatura, conta consultante, Dev, downgrade, rollback e reaplicação sem perder alterações operacionais.
- Não foi executada cobrança real nem alterada a base de produção. O ambiente isolado não reproduz todas as políticas RLS existentes e usa uma conexão; aprovação concorrente de participantes continua sendo uma verificação de staging descrita na QA de Organizador.
