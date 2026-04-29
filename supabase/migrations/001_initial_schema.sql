-- ============================================================
-- Chess Viewer – Migration 001: Initial Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for trigram search

-- ============================================================
-- ENUMS
-- ============================================================

create type user_role as enum ('admin', 'organizer', 'arbiter', 'public_user');
create type tournament_status as enum ('draft', 'registration', 'ongoing', 'finished', 'cancelled');
create type tournament_type as enum ('swiss', 'round_robin', 'knockout', 'other');
create type round_status as enum ('pending', 'ongoing', 'finished');
create type game_result as enum ('1-0', '0-1', '1/2-1/2', '*', 'bye', 'forfeit_white', 'forfeit_black', 'double_forfeit');
create type player_tournament_status as enum ('active', 'withdrawn', 'absent');

-- ============================================================
-- user_profiles
-- ============================================================

create table user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  email         text,
  role          user_role not null default 'public_user',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'public_user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- players
-- ============================================================

create table players (
  id            uuid primary key default uuid_generate_v4(),
  full_name     text not null,
  fide_id       text,
  cbx_id        text,
  federation    text default 'BRA',
  state         text,
  city          text,
  birth_year    smallint,
  rating_std    smallint,
  rating_rpd    smallint,
  rating_blz    smallint,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_players_full_name_trgm on players using gin (full_name gin_trgm_ops);
create index idx_players_fide_id on players (fide_id) where fide_id is not null;
create index idx_players_cbx_id  on players (cbx_id)  where cbx_id  is not null;

-- ============================================================
-- tournaments
-- ============================================================

create table tournaments (
  id               uuid primary key default uuid_generate_v4(),
  slug             text not null unique,
  name             text not null,
  description      text,
  city             text not null,
  state            text not null,
  venue            text,
  organizer_name   text not null,
  chief_arbiter    text,
  time_control     text not null,  -- e.g. "90'+30" or "G/15+10"
  tournament_type  tournament_type not null default 'swiss',
  start_date       date not null,
  end_date         date,
  rounds_count     smallint not null default 7,
  status           tournament_status not null default 'draft',
  is_public        boolean not null default false,
  banner_url       text,
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_tournaments_slug        on tournaments (slug);
create index idx_tournaments_status      on tournaments (status);
create index idx_tournaments_start_date  on tournaments (start_date desc);
create index idx_tournaments_name_trgm   on tournaments using gin (name gin_trgm_ops);
create index idx_tournaments_city        on tournaments (lower(city));
create index idx_tournaments_state       on tournaments (lower(state));

-- ============================================================
-- tournament_categories
-- ============================================================

create table tournament_categories (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  name           text not null,  -- e.g. "Sub-10", "Sub-12", "Absoluto"
  max_age        smallint,
  min_age        smallint,
  max_rating     smallint,
  min_rating     smallint,
  created_at     timestamptz not null default now()
);

create index idx_tournament_categories_tournament on tournament_categories (tournament_id);

-- ============================================================
-- tournament_players
-- ============================================================

create table tournament_players (
  id               uuid primary key default uuid_generate_v4(),
  tournament_id    uuid not null references tournaments(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  category_id      uuid references tournament_categories(id),
  initial_ranking  smallint,
  current_score    numeric(5,1) not null default 0,
  current_rank     smallint,
  buchholz         numeric(6,1),
  buchholz_cut1    numeric(6,1),
  sonneborn_berger numeric(8,2),
  direct_encounter numeric(5,1),
  performance_rating smallint,
  status           player_tournament_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(tournament_id, player_id)
);

create index idx_tp_tournament on tournament_players (tournament_id);
create index idx_tp_player     on tournament_players (player_id);

-- ============================================================
-- rounds
-- ============================================================

create table rounds (
  id             uuid primary key default uuid_generate_v4(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  round_number   smallint not null,
  status         round_status not null default 'pending',
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(tournament_id, round_number)
);

create index idx_rounds_tournament on rounds (tournament_id);

-- ============================================================
-- pairings
-- ============================================================

create table pairings (
  id                uuid primary key default uuid_generate_v4(),
  tournament_id     uuid not null references tournaments(id) on delete cascade,
  round_id          uuid not null references rounds(id) on delete cascade,
  board_number      smallint,
  white_tp_id       uuid references tournament_players(id),  -- white player (tournament_player)
  black_tp_id       uuid references tournament_players(id),  -- black player (null = bye)
  result            game_result not null default '*',
  white_points      numeric(3,1),
  black_points      numeric(3,1),
  is_bye            boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_pairings_round      on pairings (round_id);
create index idx_pairings_tournament on pairings (tournament_id);
create index idx_pairings_white_tp   on pairings (white_tp_id);
create index idx_pairings_black_tp   on pairings (black_tp_id);

-- ============================================================
-- standings  (materialised snapshot – updated via RPC)
-- ============================================================

create table standings (
  id                 uuid primary key default uuid_generate_v4(),
  tournament_id      uuid not null references tournaments(id) on delete cascade,
  tournament_player_id uuid not null references tournament_players(id) on delete cascade,
  points             numeric(5,1) not null default 0,
  rank               smallint,
  buchholz           numeric(6,1),
  buchholz_cut1      numeric(6,1),
  sonneborn_berger   numeric(8,2),
  direct_encounter   numeric(5,1),
  performance_rating smallint,
  games_played       smallint not null default 0,
  wins               smallint not null default 0,
  draws              smallint not null default 0,
  losses             smallint not null default 0,
  updated_at         timestamptz not null default now(),
  unique(tournament_id, tournament_player_id)
);

create index idx_standings_tournament on standings (tournament_id, rank asc nulls last);

-- ============================================================
-- player_follows
-- ============================================================

create table player_follows (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  tournament_id  uuid references tournaments(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique(user_id, player_id, tournament_id)
);

create index idx_follows_user    on player_follows (user_id);
create index idx_follows_player  on player_follows (player_id);

-- ============================================================
-- updated_at triggers
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_profiles_updated_at   before update on user_profiles   for each row execute procedure set_updated_at();
create trigger trg_players_updated_at          before update on players          for each row execute procedure set_updated_at();
create trigger trg_tournaments_updated_at      before update on tournaments      for each row execute procedure set_updated_at();
create trigger trg_tournament_players_updated  before update on tournament_players for each row execute procedure set_updated_at();
create trigger trg_rounds_updated_at           before update on rounds           for each row execute procedure set_updated_at();
create trigger trg_pairings_updated_at         before update on pairings         for each row execute procedure set_updated_at();
