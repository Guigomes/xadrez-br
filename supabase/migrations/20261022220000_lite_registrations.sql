-- Gambito Torneios (app): inscrição pelo link. O organizador abre as inscrições no app e manda o
-- link (/inscricao/<id do torneio>); pais e jogadores preenchem no site, sem conta. A inscrição
-- fica aqui até o celular do organizador aceitar (vira jogador no aparelho, que continua sendo a
-- fonte da verdade do torneio) ou recusar.

alter table public.lite_tournaments
  add column if not exists registration_open boolean not null default false;

create table if not exists public.lite_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.lite_tournaments(id) on delete cascade,
  name text not null check (length(trim(name)) between 3 and 120),
  birth_year smallint check (birth_year is null or birth_year between 1900 and 2100),
  sex char(1) check (sex is null or sex in ('m', 'w')),
  club text check (club is null or length(club) <= 120),
  rating smallint check (rating is null or rating between 0 and 3500),
  guardian_name text check (guardian_name is null or length(guardian_name) <= 120),
  contact text not null check (length(trim(contact)) between 5 and 120),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists lite_registrations_tournament_idx on public.lite_registrations(tournament_id, status);

-- Só as rotas do site (service_role): o formulário público e o celular do organizador.
alter table public.lite_registrations enable row level security;
revoke all on table public.lite_registrations from anon, authenticated;
