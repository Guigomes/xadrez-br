-- Chatbot de suporte — permite que role='admin' escreva direto em
-- chat_messages/chat_sessions via Postgrest (sem passar pela API route do
-- Next.js). Motivo: o app Android do admin (workspace-gambito-admin) fala
-- direto com o Supabase, autenticado com a própria sessão do admin — mais
-- simples que inventar uma segunda forma de autenticar contra a API do
-- site. A rota /api/chat/reply do painel web (app/admin/dev/chat) continua
-- existindo e funcionando do jeito que já funcionava (usa service_role).

create policy "chat_messages_insert_admin" on chat_messages
  for insert with check (auth_user_role() = 'admin');

create policy "chat_sessions_update_admin" on chat_sessions
  for update using (auth_user_role() = 'admin') with check (auth_user_role() = 'admin');
