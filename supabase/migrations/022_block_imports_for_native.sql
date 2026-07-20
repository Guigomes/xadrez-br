-- ============================================================
-- Chess Viewer - Migration 022: Bloqueia imports em torneios nativos (F11)
-- ============================================================
-- Defesa no banco (além da guarda no worker): não se cadastra linha de
-- importação do chess-results para torneio mode='native'. Idempotente.

create or replace function block_imports_for_native()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from tournaments t
    where t.id = new.tournament_id and t.mode = 'native'
  ) then
    raise exception 'NATIVE_TOURNAMENT: torneios nativos não usam importação do chess-results'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_block_native_imports on tournament_imports;
create trigger trg_block_native_imports
  before insert or update on tournament_imports
  for each row execute procedure block_imports_for_native();
