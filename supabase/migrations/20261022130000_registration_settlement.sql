-- ============================================================
-- Conciliação das inscrições pagas online e taxa da plataforma por inscrito
-- (plano de monetização, frente 2)
-- ============================================================
-- Hoje (078) o dinheiro da inscrição cai na conta Asaas da plataforma e o
-- repasse ao organizador é acertado por fora. Esta migration deixa esse acerto
-- auditável, sem mudar o fluxo de pagamento:
--   - cada inscrição paga guarda o valor cobrado, o líquido que a Asaas
--     informou (já sem a tarifa do gateway) e a taxa da plataforma do momento
--     da cobrança (fotografada, para mudar a taxa não reescrever o passado);
--   - tournament_payouts registra cada repasse feito ao organizador;
--   - get_tournament_settlement() calcula bruto, tarifa, taxa, líquido do
--     organizador, já repassado e saldo — a mesma conta para o organizador e
--     para o admin.
--
-- Taxa da plataforma: app_settings.registration_platform_fee_cents, por
-- inscrição paga, DESCONTADA do organizador (o inscrito paga o mesmo valor de
-- sempre). Nasce 0 = nenhuma mudança de comportamento até o dono decidir.
--
-- Idempotente.

alter table tournament_registrations add column if not exists paid_value_cents integer;
alter table tournament_registrations add column if not exists net_value_cents integer;
alter table tournament_registrations add column if not exists platform_fee_cents integer not null default 0
  check (platform_fee_cents >= 0);
alter table tournament_registrations add column if not exists paid_at timestamptz;

insert into app_settings (key, value) values ('registration_platform_fee_cents', '0')
on conflict (key) do nothing;

create table if not exists tournament_payouts (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  amount_cents  integer not null check (amount_cents > 0),
  paid_on       date not null default current_date,
  method        text not null default 'pix',
  note          text,
  created_by    uuid references user_profiles(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_tournament_payouts_tournament on tournament_payouts(tournament_id, paid_on);

alter table tournament_payouts enable row level security;

drop policy if exists tournament_payouts_select on tournament_payouts;
create policy tournament_payouts_select on tournament_payouts for select
  using (auth_user_role() = 'admin' or is_tournament_organizer(tournament_id));

drop policy if exists tournament_payouts_write_admin on tournament_payouts;
create policy tournament_payouts_write_admin on tournament_payouts for all
  using (auth_user_role() = 'admin') with check (auth_user_role() = 'admin');

-- Valores em centavos. Inscrição paga antes desta migration não tem o valor
-- fotografado: cai no valor de inscrição atual do torneio e conta como
-- "estimada" (estimated_count), para a tela avisar.
create or replace function get_tournament_settlement(p_tournament_id uuid)
returns table (
  paid_count        integer,
  estimated_count   integer,
  gross_cents       bigint,
  gateway_fee_cents bigint,
  platform_fee_cents bigint,
  organizer_net_cents bigint,
  paid_out_cents    bigint,
  balance_cents     bigint,
  refunded_count    integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.auth_user_role() = 'admin' or public.is_tournament_organizer(p_tournament_id)) then
    raise exception 'FORBIDDEN: só o organizador do torneio ou um admin vê o financeiro' using errcode = '42501';
  end if;

  return query
  with t as (select registration_fee_cents fee from tournaments where id = p_tournament_id),
  r as (
    select coalesce(reg.paid_value_cents, t.fee, 0) as gross,
           -- sem líquido informado pela Asaas, não inventa tarifa: considera zero
           coalesce(reg.paid_value_cents, t.fee, 0) - coalesce(reg.net_value_cents, reg.paid_value_cents, t.fee, 0) as gateway,
           reg.platform_fee_cents as platform,
           (reg.paid_value_cents is null) as estimated
      from tournament_registrations reg cross join t
     where reg.tournament_id = p_tournament_id and reg.payment_status = 'paid'
  ),
  agg as (
    select count(*)::int n, count(*) filter (where estimated)::int est,
           coalesce(sum(gross), 0)::bigint g, coalesce(sum(gateway), 0)::bigint gw, coalesce(sum(platform), 0)::bigint pf
      from r
  ),
  po as (select coalesce(sum(amount_cents), 0)::bigint paid from tournament_payouts where tournament_id = p_tournament_id)
  select agg.n, agg.est, agg.g, agg.gw, agg.pf,
         agg.g - agg.gw - agg.pf,
         po.paid,
         agg.g - agg.gw - agg.pf - po.paid,
         (select count(*)::int from tournament_registrations
           where tournament_id = p_tournament_id and payment_status = 'refunded')
    from agg cross join po;
end $$;

grant execute on function get_tournament_settlement(uuid) to authenticated;

-- Visão do admin: torneios com dinheiro recebido online e o saldo a repassar.
create or replace function get_payout_overview()
returns table (
  tournament_id uuid, slug text, name text, start_date date, organizer_name text,
  paid_count integer, organizer_net_cents bigint, paid_out_cents bigint, balance_cents bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_user_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN: só admin' using errcode = '42501';
  end if;
  return query
  select t.id, t.slug, t.name, t.start_date::date, coalesce(up.full_name, t.organizer_name),
         s.paid_count, s.organizer_net_cents, s.paid_out_cents, s.balance_cents
    from tournaments t
    left join user_profiles up on up.id = t.created_by
    cross join lateral public.get_tournament_settlement(t.id) s
   where exists (select 1 from tournament_registrations r
                  where r.tournament_id = t.id and r.payment_status in ('paid', 'refunded'))
   order by s.balance_cents desc, t.start_date desc;
end $$;

grant execute on function get_payout_overview() to authenticated;
