-- Log centralizado de erros não esperados — cliente (window.onerror,
-- unhandledrejection, app/error.tsx, app/global-error.tsx) e servidor
-- (catch de rotas de API). Só admin lê; escrita sempre via service_role
-- (createAdminClient em lib/log-error.ts ou na rota /api/log-error), então
-- não precisa de policy de insert pro client.

create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('client', 'server', 'api')),
  message text not null,
  stack text,
  route text,
  method text,
  status_code int,
  user_id uuid references auth.users(id) on delete set null,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx on error_logs (created_at desc);

alter table error_logs enable row level security;

create policy "error_logs_select_admin" on error_logs
  for select using (auth_user_role() = 'admin');
