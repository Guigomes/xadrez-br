-- ============================================================
-- Chess Viewer - Migration 026: Torneio gratuito
-- ============================================================
-- Organizador pode marcar o torneio como gratuito. Quando gratuito, a
-- inscrição não exige (nem exibe) comprovante de pagamento, independente
-- do valor de require_payment_receipt.
-- Idempotente.

alter table tournaments
  add column if not exists is_free boolean not null default false;

create or replace function enforce_payment_receipt_required()
returns trigger language plpgsql as $$
begin
  if new.payment_receipt_path is null and exists (
    select 1 from tournaments t
    where t.id = new.tournament_id
      and t.require_payment_receipt = true
      and t.is_free = false
  ) then
    raise exception 'PAYMENT_RECEIPT_REQUIRED: este torneio exige comprovante de pagamento na inscrição'
      using errcode = '23514';
  end if;
  return new;
end $$;
