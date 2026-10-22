-- Notificações no app Android Gambito Torneios (Firebase Cloud Messaging).
--
-- O site já calcula os eventos (rodada iniciada, resultado de jogador, rodada concluída —
-- /api/internal/notify-round com push_notification_events) e manda Web Push para o navegador
-- (push_subscriptions, uma assinatura por navegador e por torneio). O app usa os mesmos eventos,
-- com duas diferenças: o destino é um token FCM, e um aparelho segue VÁRIOS torneios — por isso
-- tabelas próprias em vez de push_subscriptions (endpoint único = um torneio por navegador).
--
-- app_push_tokens: um aparelho (token FCM) e, se a pessoa entrou com a conta, o usuário —
-- usado para avisos pessoais (organizador e árbitro do Gambito Lite).
-- app_push_follows: o que o aparelho acompanha. Mesma regra do navegador: sem jogador escolhido
-- recebe o resumo do torneio; com jogadores, recebe o início da categoria e os resultados deles.

create table if not exists public.app_push_tokens (
  token text primary key,
  user_id uuid references auth.users(id) on delete set null,
  platform text not null default 'android' check (platform in ('android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_push_tokens_user_idx on public.app_push_tokens(user_id);

create table if not exists public.app_push_follows (
  token text not null references public.app_push_tokens(token) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  followed_player_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (token, tournament_id)
);

create index if not exists app_push_follows_tournament_idx on public.app_push_follows(tournament_id);

-- Só as rotas do site (service_role) leem e escrevem.
alter table public.app_push_tokens enable row level security;
alter table public.app_push_follows enable row level security;
revoke all on table public.app_push_tokens from anon, authenticated;
revoke all on table public.app_push_follows from anon, authenticated;
