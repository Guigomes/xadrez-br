-- Tokens FCM do app Android Gambito Admin (workspace-gambito-admin) — usado
-- por lib/push.ts (sendFcmToAdmins) pra empurrar notificação push nativa
-- quando um usuário pede atendimento humano ou manda mensagem nova numa
-- sessão já escalada. Substitui o polling em foreground service do app
-- (matava bateria e atrasava muito com o app fechado / otimização OEM).
--
-- Um token por linha (upsert por token, não por user_id — reinstalar o app
-- ou trocar de device gera token novo, e o antigo é removido pelo próprio
-- FCM quando fica inválido, ver lib/push.ts).

create table if not exists admin_fcm_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_fcm_tokens_user_id_idx on admin_fcm_tokens (user_id);

alter table admin_fcm_tokens enable row level security;

-- App grava/atualiza/remove só o próprio token (auth.uid() = quem logou no
-- app Android) — leitura pra disparar push é sempre via service_role
-- (lib/push.ts), então não precisa de policy de select pro client.
create policy "admin_fcm_tokens_own_write" on admin_fcm_tokens
  for insert with check (user_id = auth.uid());

create policy "admin_fcm_tokens_own_update" on admin_fcm_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "admin_fcm_tokens_own_delete" on admin_fcm_tokens
  for delete using (user_id = auth.uid());

-- Deletar mensagem de erro (app Android, tela "Erros do site") — só select
-- existia até aqui (migration 053).
drop policy if exists "error_logs_delete_admin" on error_logs;
create policy "error_logs_delete_admin" on error_logs
  for delete using (auth_user_role() = 'admin');
