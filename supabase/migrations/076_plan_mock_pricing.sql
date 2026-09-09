-- ============================================================
-- Migration 076: preço/ciclo MOCK dos planos pagos
-- ============================================================
-- Placeholder pra exercitar o fluxo de assinatura (rota
-- app/api/subscriptions/create) sem ainda ter decidido preço de verdade —
-- a 073 deixou price_cents/billing_interval nulos de propósito, e a rota
-- de assinatura recusa cobrar plano sem os dois preenchidos.
--
-- Valores SEM validade comercial. Trocar por UPDATE direto quando o preço
-- real for decidido — não tem nenhuma lógica que dependa destes números
-- específicos, só que existam.
-- Idempotente.

update plans set price_cents = 2990,  billing_interval = 'month' where code = 'plus'       and price_cents is null;
update plans set price_cents = 7990,  billing_interval = 'month' where code = 'pro'         and price_cents is null;
update plans set price_cents = 19990, billing_interval = 'month' where code = 'federation'  and price_cents is null;
