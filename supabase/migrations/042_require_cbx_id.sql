-- ============================================================
-- Chess Viewer - Migration 042: ID CBX obrigatório (opcional por torneio)
-- ============================================================
-- Mesmo padrão de require_payment_receipt (025): flag no torneio + trigger
-- que barra a inscrição pública sem o dado exigido. Cadastro manual pelo
-- organizador (Participantes) continua livre — quem cadastra à mão já está
-- vouching pelo jogador, a trava é só pra quem se inscreve sozinho.

alter table tournaments
  add column if not exists require_cbx_id boolean not null default false;

create or replace function enforce_cbx_id_required()
returns trigger language plpgsql as $$
begin
  if (new.cbx_id is null or btrim(new.cbx_id) = '') and exists (
    select 1 from tournaments t
    where t.id = new.tournament_id and t.require_cbx_id = true
  ) then
    raise exception 'CBX_ID_REQUIRED: este torneio exige ID CBX na inscrição'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_cbx_id_required on tournament_registrations;
create trigger trg_cbx_id_required
  before insert on tournament_registrations
  for each row execute procedure enforce_cbx_id_required();
