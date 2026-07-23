-- ============================================================
-- Chess Viewer - Migration 028: Dados de autopreenchimento do participante
-- ============================================================
-- A migration 027 criou a flag is_participant, mas ela ainda não fazia
-- nada por si só. Esta migration adiciona em user_profiles os mesmos
-- campos que tournament_registrations pede (011/025), para que a
-- inscrição de uma pessoa logada com is_participant possa vir pré-
-- preenchida a partir do perfil, e para que cada inscrição enviada
-- realimente o perfil com os dados mais recentes.
-- Idempotente.

alter table user_profiles add column if not exists birth_year int;
alter table user_profiles add column if not exists city text;
alter table user_profiles add column if not exists state text;
alter table user_profiles add column if not exists club_or_school text;
alter table user_profiles add column if not exists federation text not null default 'BRA';
alter table user_profiles add column if not exists fide_id text;
alter table user_profiles add column if not exists cbx_id text;
alter table user_profiles add column if not exists phone text;
