-- ============================================================
-- Chess Viewer - Migration 038: novos status de torneio
-- ============================================================
-- Insere dois valores no ciclo de vida de tournament_status, entre os
-- existentes: draft → published → registration → registration_closed →
-- ongoing → finished (cancelled continua um ramo lateral, inalterado).
--
-- 'published': visível publicamente (RLS já usa status <> 'draft', então
-- passa a valer automaticamente), mas inscrições ainda não abertas.
-- 'registration_closed': período de inscrição encerrado, rodadas ainda não
-- começaram — hoje isso só existia como rótulo calculado no cliente
-- (isRegistrationClosed em lib/utils/chess.ts); vira status real no banco.
--
-- Idempotente. Obs: os valores não podem ser USADOS na mesma transação que
-- os cria (regra do Postgres p/ ALTER TYPE ADD VALUE, mesma nota de
-- 016_round_lifecycle.sql) — por isso este arquivo contém só os dois
-- ALTER TYPE, nada mais.

alter type tournament_status add value if not exists 'published' before 'registration';
alter type tournament_status add value if not exists 'registration_closed' before 'ongoing';
