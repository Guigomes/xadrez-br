-- ============================================================
-- Migration 083: conta nova nasce organizadora
-- ============================================================
-- Login virou só Google. O cadastro por e-mail mandava as capacidades no
-- metadata do signup (checkbox "Organizar torneios" já vinha marcado); o
-- Google não manda nada, então as três flags caíam em false e o insert em
-- user_profiles violava user_profiles_at_least_one_capability (027) — o
-- cadastro pelo Google falhava inteiro.
--
-- Agora, sem metadata, a conta nasce organizadora (decisão do dono,
-- 2026-09-24). Metadata explícito continua valendo como antes (o form de
-- e-mail, ainda ligado em dev/e2e, pode desmarcar).
--
-- Idempotente.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name, email, role, is_organizer, is_arbiter, is_participant)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'public_user',
    coalesce((new.raw_user_meta_data->>'is_organizer')::boolean, true),
    coalesce((new.raw_user_meta_data->>'is_arbiter')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_participant')::boolean, false)
  );
  return new;
end;
$$;
