# Assinatura de Organizador — primeira etapa

Preço aprovado: **R$ 19,99/mês**, ciclo `MONTHLY` na Asaas. Uma assinatura ativa da conta proprietária libera torneios com mais de 20 jogadores, sem cobrar por torneio. Não há limite novo de quantidade de torneios nesta etapa.

Complemento posterior: Jogador+ por R$ 4,99/mês tem lançamento independente para histórico completo. Ver `assinatura-historico-jogadores.md`: com ambos os interruptores seletivos ligados, a vitrine mostra Grátis, Jogador+ e Organizador, sem ligar a cobrança global.

## Regra e preservação

- Até 20 participantes por torneio, sem assinatura; a inclusão/aprovação do 21º exige assinatura ativa com `organizer.large_tournaments` habilitado. Conta de equipe paga não substitui a assinatura do proprietário.
- Conta todos os participantes de todos os grupos, inclusive retirados. Inscrições pendentes não contam até a aprovação criar o participante.
- Torneios já grandes não perdem jogadores, resultados, edição ou rodadas. Sem assinatura, somente novas inclusões ficam bloqueadas.
- Dev/Admin (proprietário ou ator autenticado) é isento. Chamadas com service role não têm isenção automática.
- `pending`, `overdue` e `canceled` não liberam capacidade. Alterar somente `user_profiles.plan_id` também não libera.
- O trigger privado protege INSERT/bulk INSERT/transferência para outro torneio e aprovações via RPC, inclusive chamadas que não passam pela interface. Lock no torneio serializa inclusões.
- `organizer_billing_enabled` controla este lançamento. **Não alterar `billing_enabled=false`**: as demais funcionalidades continuam liberadas e os planos antigos de teste não são vendidos.

## Checkout e eventos

- `/planos` mostra Grátis + Organizador quando somente o novo interruptor está ligado.
- Checkout valida sessão registrada, plano público, preço e ciclo no servidor; grava assinatura pendente, sem promover o plano do usuário.
- Nova tentativa com assinatura pendente/vencida recupera a mesma fatura. Índice único impede duas recorrências locais vivas do mesmo plano; conflito cancela somente a recorrência recém-criada.
- `PAYMENT_CONFIRMED/RECEIVED` ativa; atraso revoga capacidade; reembolso, exclusão, chargeback ou `SUBSCRIPTION_DELETED/INACTIVATED` cancela. Evento de criação/atualização de assinatura não concede acesso. Pagamento atrasado de assinatura já cancelada não a reativa.
- Falhas de escrita de assinatura retornam erro ao webhook e removem o marcador de deduplicação para permitir nova tentativa. Cancelamentos repetidos são idempotentes.
- O mock só funciona fora de produção e sem chave da Asaas. A base de produção não deve ser usada com mocks.
- Nesta etapa, cancelamento é feito na Asaas pelo suporte/Dev; não foi criada tela de autogestão de assinatura. Cancelamento revoga novas inclusões imediatamente, sem apagar o torneio.

## Publicação futura (não executada nesta implementação)

1. Conferir `ASAAS_API_KEY`, `ASAAS_API_URL` de produção, `ASAAS_WEBHOOK_TOKEN` e `NEXT_PUBLIC_APP_URL`, sem registrar valores em logs.
2. Configurar o webhook `/api/webhooks/asaas` para eventos de pagamento e eventos terminais de assinatura, com o token correto. Não fazer cobrança de teste em conta real sem aprovação.
3. Aplicar `20261102052706_organizer_subscription_player_limit.sql` pelo procedimento do repositório e registrar o histórico. Conferir que o global permanece desligado e Organizador tem `price_cents=1999`, moeda BRL, intervalo month. A migration não sobrescreve preço/interruptores já existentes em reaplicações.
4. Publicar o código. Fazer compra e aprovação 20→21 em sandbox/preview; depois conferir status real por webhook antes de disponibilizar a contratação em produção.
5. Reversão rápida: definir `organizer_billing_enabled=false` (oculta a oferta e libera inclusões). Não remover planos/assinaturas/participantes. Esse interruptor **não cancela cobranças recorrentes já contratadas**; tratar cancelamentos separadamente na Asaas, com aprovação.

## Verificação local

Testes Vitest: `lib/__tests__/organizer-*.test.ts`. Incluem decisões 19/20/21, preço aprovado, autenticação/autorização antes de acesso privilegiado, isolamento proprietário/equipe, preço não controlado pelo cliente, recuperação de checkout, compensação de concorrência e eventos de pagamento/cancelamento.

SQL real isolado (PostgreSQL via PGlite 0.5.14): instalar o pacote em diretório externo ao app, sem dependência nova no produto, e executar:

```text
node scripts/test-organizer-subscription.mjs <diretório-externo-com-pglite>
```

Aplica a migration duas vezes em fixtures mínimas compatíveis e verifica 26 condições, incluindo o trigger real, bulk rollback, grupo, retirados, pendentes, estados da assinatura, downgrade sem perda de dados, Dev, índice único, privilégio privado e rollback por interruptor. Não testa a base de produção nem todas as políticas RLS existentes. PGlite tem uma conexão: **a corrida de duas aprovações em conexões PostgreSQL separadas ainda precisa de teste em staging**.
