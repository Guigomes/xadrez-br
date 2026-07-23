-- ============================================================
-- Chess Viewer - Migration 027: Capacidade "participante"
-- ============================================================
-- A migration 026 deixou explícito que "participante" não precisava de
-- flag, já que a inscrição em torneio (tournament_registrations) é aberta
-- a qualquer pessoa, logada ou não. Continua sendo assim — is_participant
-- não é pré-requisito para se inscrever. A flag existe só para sinalizar
-- que a pessoa quer ter seus dados reaproveitados para preencher a
-- inscrição automaticamente em torneios futuros.
--
-- Com uma terceira capacidade em jogo, passa a existir a regra: a conta
-- precisa ter pelo menos uma das três (organizador / árbitro / participante)
-- — não faz sentido uma conta sem nenhuma. Contas existentes sem nenhuma
-- flag ativa (o antigo "public_user" puro) recebem is_participant=true no
-- backfill para não ficar num estado inválido.
-- Idempotente.

alter table user_profiles add column if not exists is_participant boolean not null default true;

update user_profiles set is_participant = true
where not is_organizer and not is_arbiter and not is_participant;

alter table user_profiles drop constraint if exists user_profiles_at_least_one_capability;
alter table user_profiles add constraint user_profiles_at_least_one_capability
  check (is_organizer or is_arbiter or is_participant);

-- ------------------------------------------------------------
-- Cadastro: lê is_participant do metadata enviado no signup, igual às
-- outras duas flags.
-- ------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name, email, role, is_organizer, is_arbiter, is_participant)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'public_user',
    coalesce((new.raw_user_meta_data->>'is_organizer')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_arbiter')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_participant')::boolean, false)
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- RPC de autoatendimento: agora recebe as três capacidades. A assinatura
-- de 2 parâmetros (026) vira uma sobrecarga morta se não for removida —
-- dropa antes de recriar.
-- ------------------------------------------------------------
drop function if exists set_my_capabilities(boolean, boolean);

create or replace function set_my_capabilities(p_is_organizer boolean, p_is_arbiter boolean, p_is_participant boolean)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if not (p_is_organizer or p_is_arbiter or p_is_participant) then
    raise exception 'FORBIDDEN: mantenha pelo menos uma capacidade ativa' using errcode = '23514';
  end if;
  update user_profiles
  set is_organizer = p_is_organizer, is_arbiter = p_is_arbiter, is_participant = p_is_participant
  where id = auth.uid();
end $$;
