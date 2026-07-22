-- ============================================================
-- Chess Viewer - Migration 026: Capacidades coexistentes
-- ============================================================
-- Antes: user_profiles.role era uma categoria única e excludente
-- (admin | organizer | arbiter | public_user). Isso não permitia uma
-- pessoa ser organizadora E árbitra ao mesmo tempo, e o cadastro não
-- dava nenhuma escolha (toda conta nascia 'public_user', incapaz de
-- criar torneio, apesar da tela dizer "criar conta de organizador").
--
-- Agora: 'role' fica só para admin (papel de sistema, exclusivo) vs.
-- todo o resto; is_organizer/is_arbiter são flags independentes que
-- podem coexistir. "Participante" não precisa de flag — inscrição em
-- torneio (tournament_registrations) já é aberta a qualquer pessoa,
-- logada ou não.
-- Idempotente.

alter table user_profiles add column if not exists is_organizer boolean not null default false;
alter table user_profiles add column if not exists is_arbiter boolean not null default false;

-- Backfill: contas com o role legado 'organizer'/'arbiter' ganham a
-- flag equivalente (o valor de role em si não é alterado — fica como
-- histórico inofensivo, não é mais lido por nenhuma policy nova).
update user_profiles set is_organizer = true where role in ('organizer', 'admin') and not is_organizer;
update user_profiles set is_arbiter   = true where role in ('arbiter', 'admin')   and not is_arbiter;

-- ------------------------------------------------------------
-- Helpers (substituem os "auth_user_role() in (...)" antigos)
-- ------------------------------------------------------------
create or replace function is_organizer_or_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select role = 'admin' or is_organizer from user_profiles where id = auth.uid()),
    false
  );
$$;

create or replace function is_arbiter_or_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select role = 'admin' or is_arbiter from user_profiles where id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------
-- RLS: troca as checagens de role único pelas novas flags coexistentes
-- ------------------------------------------------------------
drop policy if exists "players_insert_auth" on players;
create policy "players_insert_auth" on players for insert with check (
  auth.uid() is not null and (is_organizer_or_admin() or is_arbiter_or_admin())
);

drop policy if exists "players_update_auth" on players;
create policy "players_update_auth" on players for update using (
  auth.uid() is not null and (is_organizer_or_admin() or is_arbiter_or_admin())
);

drop policy if exists "tournaments_insert_auth" on tournaments;
create policy "tournaments_insert_auth" on tournaments for insert with check (
  auth.uid() is not null and is_organizer_or_admin()
);

-- ------------------------------------------------------------
-- Cadastro: lê is_organizer/is_arbiter do metadata enviado no signup
-- (checkboxes do formulário), em vez de sempre nascer 'public_user'
-- sem nenhuma capacidade.
-- ------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name, email, role, is_organizer, is_arbiter)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'public_user',
    coalesce((new.raw_user_meta_data->>'is_organizer')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_arbiter')::boolean, false)
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- RPC de autoatendimento: usuário ajusta suas próprias capacidades
-- depois do cadastro, sem tocar em `role`.
-- ------------------------------------------------------------
create or replace function set_my_capabilities(p_is_organizer boolean, p_is_arbiter boolean)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  update user_profiles
  set is_organizer = p_is_organizer, is_arbiter = p_is_arbiter
  where id = auth.uid();
end $$;

-- ------------------------------------------------------------
-- FIX DE SEGURANÇA (achado nesta investigação, não introduzido agora):
-- "profiles_update_own" (migration 002) permite full self-update da
-- própria linha (using/with check só verificam id = auth.uid(), sem
-- restrição de coluna) — ou seja, qualquer usuário logado podia rodar
-- update({role: 'admin'}) na própria conta e se autopromover. RLS não
-- restringe coluna; a defesa correta é um trigger BEFORE UPDATE.
-- ------------------------------------------------------------
create or replace function prevent_role_self_escalation()
returns trigger language plpgsql security definer as $$
declare
  v_actor_role user_role;
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null then
      select role into v_actor_role from user_profiles where id = auth.uid();
      if v_actor_role is distinct from 'admin' then
        raise exception 'FORBIDDEN: alterar role exige admin' using errcode = '42501';
      end if;
    end if;
    -- auth.uid() is null = contexto de serviço (service_role/scripts
    -- confiáveis) — não bloqueado.
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_role_escalation on user_profiles;
create trigger trg_prevent_role_escalation
  before update on user_profiles
  for each row execute procedure prevent_role_self_escalation();
