-- Caixa de mensagens na área logada (/minha-area/mensagens) + admin iniciando conversa.
--
-- 1. user_last_read_at: até quando o dono da conversa já leu. "Não lida" = mensagem humana da
--    equipe (role='assistant' e is_human=true) depois disso. Resposta do bot não conta: o
--    usuário já a viu na hora, no widget.
-- 2. started_by: admin que abriu a conversa (null = o próprio usuário abriu pelo widget).
-- 3. my_unread_chat_count(): contador do selo "Mensagens" no menu, sem varrer mensagens no
--    cliente. security definer, mas só olha as conversas de auth.uid().
--
-- Idempotente. Conversas antigas nascem "lidas" (user_last_read_at = last_message_at), para o
-- selo não acender com histórico velho.

alter table chat_sessions add column if not exists user_last_read_at timestamptz;
alter table chat_sessions add column if not exists started_by uuid references auth.users(id) on delete set null;

update chat_sessions set user_last_read_at = last_message_at where user_last_read_at is null;

create or replace function my_unread_chat_count()
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::int
  from chat_messages m
  join chat_sessions s on s.id = m.session_id
  where s.user_id = auth.uid()
    and m.role = 'assistant'
    and m.is_human
    and m.created_at > coalesce(s.user_last_read_at, '-infinity'::timestamptz);
$$;

revoke all on function my_unread_chat_count() from public;
grant execute on function my_unread_chat_count() to authenticated;
