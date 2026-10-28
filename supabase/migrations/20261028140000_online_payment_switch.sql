-- ============================================================
-- Interruptor global do pagamento online de inscrição (desligado, temporário)
-- ============================================================
-- Pedido do dono (2026-10-28): desabilitar por um tempo a cobrança automática da taxa de
-- inscrição pelo Asaas (078). Mesmo padrão do check-in (20261028120000) e da cobrança de
-- planos (082): uma chave em app_settings, sem mexer na configuração de cada torneio.
--
-- Com a chave desligada, inscrição em torneio com accept_online_payment = true segue o fluxo
-- manual: nasce payment_status = 'not_required', sem exigir CPF/CNPJ nem e-mail, e o
-- organizador combina o pagamento por fora (texto da taxa e, se marcado, comprovante). A rota
-- de pagamento recusa gerar cobrança nova. Cobranças já criadas continuam sendo confirmadas
-- pelo webhook normalmente.
--
-- RELIGAR:
--   update app_settings set value = 'true' where key = 'registration_payment_enabled';
--
-- Linha ausente = pagamento online LIGADO (comportamento de antes desta migration).
--
-- Idempotente. `do nothing`: reaplicar não pode religar/desligar uma chave que alguém já mexeu.

insert into app_settings (key, value) values ('registration_payment_enabled', 'false')
on conflict (key) do nothing;

create or replace function public.registration_payment_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select (value #>> '{}')::boolean from public.app_settings where key = 'registration_payment_enabled'),
    true);
$$;

grant execute on function public.registration_payment_enabled() to anon, authenticated;

-- Definição vigente (079) + a chave global na condição de cobrar.
create or replace function public.enforce_registration_payment_status()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_t tournaments%rowtype;
begin
  select * into v_t from tournaments where id = new.tournament_id;
  new.asaas_customer_id := null;
  new.asaas_payment_id := null;
  new.asaas_invoice_url := null;
  if new.is_waitlisted then
    new.payment_status := 'not_required';
  elsif v_t.accept_online_payment and not v_t.is_free and public.registration_payment_enabled() then
    if v_t.registration_fee_cents is null or v_t.registration_fee_cents <= 0 then
      raise exception 'REGISTRATION_FEE_NOT_SET' using errcode = '23514';
    end if;
    if nullif(trim(new.cpf_cnpj), '') is null then raise exception 'CPF_CNPJ_REQUIRED' using errcode = '23514'; end if;
    if nullif(trim(new.email), '') is null then raise exception 'EMAIL_REQUIRED' using errcode = '23514'; end if;
    new.payment_status := 'pending';
  else
    new.payment_status := 'not_required';
  end if;
  return new;
end $$;

-- Definição vigente (079) + a chave global ao promover da lista de espera.
create or replace function public.promote_tournament_waitlist(p_tournament_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t tournaments%rowtype; v_reserved integer; v_promoted integer := 0; v_row record;
begin
  select * into v_t from tournaments where id = p_tournament_id for update;
  select
    (select count(*) from tournament_players tp where tp.tournament_id = p_tournament_id and tp.status = 'active')
    +
    (select count(*) from tournament_registrations r where r.tournament_id = p_tournament_id
      and r.status = 'pending' and not r.is_waitlisted)
  into v_reserved;
  for v_row in select id from tournament_registrations
    where tournament_id = p_tournament_id and status = 'pending' and is_waitlisted
    order by created_at for update
  loop
    exit when v_t.max_participants is not null and v_reserved >= v_t.max_participants;
    update tournament_registrations set is_waitlisted = false, waitlisted_at = null,
      promoted_at = now(),
      payment_status = case when v_t.accept_online_payment and not v_t.is_free and public.registration_payment_enabled()
                            then 'pending' else 'not_required' end
      where id = v_row.id;
    v_reserved := v_reserved + 1; v_promoted := v_promoted + 1;
  end loop;
  return v_promoted;
end $$;
revoke all on function public.promote_tournament_waitlist(uuid) from public, anon, authenticated;
