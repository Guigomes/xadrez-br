-- Preserve the exact name received from an external tournament source.
-- `players.full_name` remains the canonical display name; this field is an
-- import alias scoped to a tournament entry and may be null for native events.
alter table public.tournament_players
  add column if not exists source_name text;

comment on column public.tournament_players.source_name is
  'Exact player name received from the external tournament source, used as an import/search alias.';
