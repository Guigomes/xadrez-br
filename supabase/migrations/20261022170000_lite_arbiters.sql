-- Gambito Lite: árbitros lançam resultado das mesas atribuídas pelo próprio celular.
--
-- O torneio continua tendo um só "dono da verdade": o aparelho do organizador. O árbitro não
-- escreve no torneio; ele deixa o resultado numa fila (lite_result_submissions). O celular do
-- organizador busca a fila, aplica no aparelho, confirma (applied/rejected) e reenvia o backup —
-- que é de onde o árbitro lê o estado da mesa. Assim a trava de aparelho continua valendo.
--
-- lite_tournament_arbiters é derivada do backup a cada envio (rota /api/lite/sync): quem pode
-- abrir o torneio como árbitro, pelo e-mail da conta Google.

create table if not exists public.lite_tournament_arbiters (
  tournament_id uuid not null references public.lite_tournaments(id) on delete cascade,
  email text not null,
  name text not null,
  primary key (tournament_id, email)
);

create index if not exists lite_tournament_arbiters_email_idx on public.lite_tournament_arbiters(email);

create table if not exists public.lite_result_submissions (
  tournament_id uuid not null references public.lite_tournaments(id) on delete cascade,
  game_id uuid not null,
  round_number integer not null,
  board integer not null,
  result text not null check (result in ('*', '1-0', '0-1', '1/2-1/2', 'forfeit_white', 'forfeit_black', 'double_forfeit')),
  arbiter_email text not null,
  arbiter_name text not null,
  arbiter_user_id uuid not null references auth.users(id) on delete cascade,
  -- Muda a cada novo envio do árbitro: a confirmação do organizador só vale para a versão que ele viu.
  rev uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, game_id)
);

create index if not exists lite_result_submissions_pending_idx
  on public.lite_result_submissions(tournament_id) where status = 'pending';

-- Só as rotas do site (service_role) leem e escrevem: elas conferem dono e árbitro.
alter table public.lite_tournament_arbiters enable row level security;
alter table public.lite_result_submissions enable row level security;
