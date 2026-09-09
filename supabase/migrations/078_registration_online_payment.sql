-- ============================================================
-- Migration 078: pagamento de inscrição online (Asaas)
-- ============================================================
-- Complementa a cobrança da mensalidade do organizador (075): agora o
-- INSCRITO pode pagar a taxa de inscrição na hora, via Asaas, em vez do
-- fluxo manual existente (registration_fee_text + comprovante, 025). É uma
-- configuração por torneio, opt-in (accept_online_payment) — os dois fluxos
-- coexistem; torneio sem essa flag continua no comprovante manual.
--
-- v1: o dinheiro cai direto na conta Asaas do dono da API key (decisão
-- consciente do usuário pra lançar rápido, sem sub-conta/split por
-- organizador). Repasse pro organizador do torneio é acerto manual por
-- fora, por ora.
--
-- Idempotente.

alter table tournaments
  add column if not exists accept_online_payment boolean not null default false;
alter table tournaments
  add column if not exists registration_fee_cents integer null
    check (registration_fee_cents is null or registration_fee_cents > 0);

alter table tournament_registrations
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'overdue', 'refunded'));
alter table tournament_registrations
  add column if not exists cpf_cnpj text;
alter table tournament_registrations
  add column if not exists asaas_customer_id text;
alter table tournament_registrations
  add column if not exists asaas_payment_id text;
alter table tournament_registrations
  add column if not exists asaas_invoice_url text;

create unique index if not exists idx_tournament_registrations_asaas_payment_id
  on tournament_registrations(asaas_payment_id) where asaas_payment_id is not null;

-- Servidor decide payment_status de verdade — nunca o formulário. Mesmo
-- padrão de enforce_payment_receipt_required (025): a regra de negócio mora
-- no banco, não só no client. asaas_customer_id/payment_id/invoice_url só
-- passam a existir depois, gravados via service_role (rota de pagamento e
-- webhook) — nascem sempre nulos no insert, ignorando o que o client mandar.
create or replace function enforce_registration_payment_status()
returns trigger language plpgsql as $$
declare
  v_t tournaments%rowtype;
begin
  select * into v_t from tournaments where id = new.tournament_id;

  new.asaas_customer_id := null;
  new.asaas_payment_id  := null;
  new.asaas_invoice_url := null;

  if v_t.accept_online_payment and not v_t.is_free then
    if v_t.registration_fee_cents is null or v_t.registration_fee_cents <= 0 then
      raise exception 'REGISTRATION_FEE_NOT_SET: torneio aceita pagamento online mas não tem valor de inscrição configurado'
        using errcode = '23514';
    end if;
    if new.cpf_cnpj is null or length(trim(new.cpf_cnpj)) = 0 then
      raise exception 'CPF_CNPJ_REQUIRED: este torneio exige CPF/CNPJ para pagar a inscrição na hora'
        using errcode = '23514';
    end if;
    if new.email is null or length(trim(new.email)) = 0 then
      raise exception 'EMAIL_REQUIRED: este torneio exige e-mail para pagar a inscrição na hora'
        using errcode = '23514';
    end if;
    new.payment_status := 'pending';
  else
    new.payment_status := 'not_required';
  end if;

  return new;
end $$;

drop trigger if exists trg_registration_payment_status on tournament_registrations;
create trigger trg_registration_payment_status
  before insert on tournament_registrations
  for each row execute procedure enforce_registration_payment_status();

-- Trava simétrica do lado do organizador: gate por entitlement de plano
-- (073) — has_entitlement/entitlement_limit já existiam mas nada no app
-- checava de verdade (achado de sessão anterior, migration 073 continua
-- sendo a única enforcement real além desta). Mesmo padrão de
-- enforce_tournament_plan_limit: contexto de serviço (auth.uid() nulo) e
-- admin passam direto.
create or replace function enforce_registration_payment_entitlement()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is null then return new; end if;
  if public.auth_user_role() = 'admin' then return new; end if;

  if not public.has_entitlement('registration.payment') then
    raise exception 'PLAN_LIMIT: seu plano não permite cobrança na inscrição'
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_registration_payment_entitlement on tournaments;
create trigger trg_registration_payment_entitlement
  before insert or update of accept_online_payment on tournaments
  for each row
  when (new.accept_online_payment)
  execute procedure enforce_registration_payment_entitlement();
