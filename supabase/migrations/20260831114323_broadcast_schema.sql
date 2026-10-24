-- RECUPERADA do registro do Supabase (supabase_migrations.schema_migrations) em 2026-10-24.
-- Esta migration já estava aplicada em produção mas não tinha arquivo neste repositório:
-- ela pertence ao app de transmissão de partidas ("Chess Match Film"), que usa o MESMO
-- banco do Gambito Torneios. O conteúdo abaixo é exatamente o que foi aplicado (versão 20260831114323).
-- Chess Match Film — live broadcast schema
--
-- Design notes:
--   * broadcasts / broadcast_moves are public-readable (anon SELECT) so the
--     web viewer needs no auth. Nothing is publicly writable — writes only
--     happen through Edge Functions, using the service role key.
--   * broadcast_keys is a SEPARATE table with RLS enabled and zero policies.
--     The mobile app's anon key ships inside the APK and is extractable, so
--     the per-broadcast write secret must never live in a row the anon role
--     can read. Only the service role (used inside Edge Functions) can see it.
--   * broadcast_moves.ply is part of the primary key, making pushes
--     idempotent: the app's outbox can safely retry an ambiguous failure
--     without risking duplicate moves.
--
-- Namespaced with a chessfilm_ prefix and its own schema to stay isolated
-- from this project's existing tournament-management tables.

create schema if not exists chessfilm;

create table if not exists chessfilm.broadcasts (
  id uuid primary key default gen_random_uuid(),
  share_code text unique not null,
  white_player text not null default '?',
  black_player text not null default '?',
  event text,
  site text,
  status text not null default 'live' check (status in ('live', 'ended')),
  result text not null default '*',
  current_fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn text not null default '',
  ply_count int not null default 0,
  revision int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcasts_share_code_idx on chessfilm.broadcasts (share_code);

create table if not exists chessfilm.broadcast_keys (
  broadcast_id uuid primary key references chessfilm.broadcasts(id) on delete cascade,
  key_hash text not null
);

create table if not exists chessfilm.broadcast_moves (
  broadcast_id uuid not null references chessfilm.broadcasts(id) on delete cascade,
  ply int not null,
  san text not null,
  uci text not null,
  fen_after text not null,
  video_timestamp real,
  confidence real,
  created_at timestamptz not null default now(),
  primary key (broadcast_id, ply)
);

alter table chessfilm.broadcasts enable row level security;
alter table chessfilm.broadcast_moves enable row level security;
alter table chessfilm.broadcast_keys enable row level security;

drop policy if exists "broadcasts are publicly readable" on chessfilm.broadcasts;
create policy "broadcasts are publicly readable"
  on chessfilm.broadcasts for select
  using (true);

drop policy if exists "broadcast_moves are publicly readable" on chessfilm.broadcast_moves;
create policy "broadcast_moves are publicly readable"
  on chessfilm.broadcast_moves for select
  using (true);

-- broadcast_keys: RLS enabled, deliberately NO policies — inaccessible to
-- anon/authenticated roles. Only the service role (Edge Functions) bypasses RLS.

grant usage on schema chessfilm to anon, authenticated;
grant select on chessfilm.broadcasts, chessfilm.broadcast_moves to anon, authenticated;

alter publication supabase_realtime add table chessfilm.broadcasts;
alter publication supabase_realtime add table chessfilm.broadcast_moves;
