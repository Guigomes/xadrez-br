-- Chatbot de suporte — Fase 2: sessões e mensagens do bot. Ver
-- docs/plano-chatbot-suporte.md. Chat é só pra usuário logado (decisão do
-- usuário) — diferença central em relação à proposta original do plano:
-- sem `session_token` de anônimo, a sessão é dona por `user_id = auth.uid()`
-- direto, e a RLS fica bem mais simples (não precisa de header/claim
-- customizado pra provar posse da sessão).
--
-- Sem escalonamento humano nesta fase: enum e tabela ficam só com o que é
-- usado agora ('bot'/'encerrada'); os valores de escalonamento
-- ('aguardando_humano'/'humano') e a coluna `escalated_at` entram numa
-- migration futura, se/quando a Fase 3 for decidida — não antes.

create type chat_session_status as enum ('bot', 'encerrada');

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete set null,
  status chat_session_status not null default 'bot',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_idx
  on chat_sessions (user_id, last_message_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  sources jsonb,                        -- [{doc_slug, doc_title}] usados na resposta
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx
  on chat_messages (session_id, created_at);

alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

-- Select-only pro cliente: o insert (usuário e assistente) passa pela API
-- route (app/api/chat/message/route.ts), que usa createAdminClient() e
-- bypassa RLS — não precisa de policy de insert/update pro client normal.
create policy "chat_sessions_select_own" on chat_sessions
  for select using (user_id = auth.uid());

create policy "chat_messages_select_own" on chat_messages
  for select using (
    exists (select 1 from chat_sessions cs where cs.id = chat_messages.session_id and cs.user_id = auth.uid())
  );
