-- Chatbot de suporte — admin (role='admin') enxerga o histórico de todas as
-- conversas de todos os usuários, pra acompanhar qualidade das respostas.
-- Usuário comum continua vendo só a própria (chat_sessions_select_own /
-- chat_messages_select_own de 049_chat_sessions.sql) — múltiplas policies de
-- select na mesma tabela combinam com OR, não precisa alterar as antigas.

create policy "chat_sessions_select_admin" on chat_sessions
  for select using (auth_user_role() = 'admin');

create policy "chat_messages_select_admin" on chat_messages
  for select using (auth_user_role() = 'admin');
