-- Pergunta que o Gambito não conseguiu responder (nem pelo CONTEXTO da KB,
-- nem pelas ferramentas de dado ao vivo, ver lib/chat/tools.ts) — registrada
-- pra revisão manual depois (que documento falta escrever, que ferramenta
-- falta criar). Diferente de error_logs: isso não é bug, é lacuna de
-- produto. Só admin lê; escrita sempre via service_role (o modelo chama a
-- ferramenta registrar_pergunta_sem_resposta, route.ts grava com
-- createAdminClient()).

create table if not exists unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  question text not null,
  created_at timestamptz not null default now()
);

create index if not exists unanswered_questions_created_at_idx on unanswered_questions (created_at desc);

alter table unanswered_questions enable row level security;

create policy "unanswered_questions_select_admin" on unanswered_questions
  for select using (auth_user_role() = 'admin');
