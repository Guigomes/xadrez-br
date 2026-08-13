-- Chat anônimo (sem login), de forma REVERSÍVEL. Ligado/desligado pelo flag
-- de aplicação NEXT_PUBLIC_CHAT_ALLOW_ANONYMOUS (lib/chat/config.ts) — esta
-- migration só abre a POSSIBILIDADE no banco; enquanto o flag estiver off,
-- nenhuma sessão anônima nasce e nada muda pra quem já está logado.
--
-- Duas mudanças:
--   1. chat_sessions.user_id passa a aceitar null (sessão sem dono = anônima).
--   2. Leitura de sessão/mensagem anônima (user_id is null) liberada a quem
--      tiver o UUID da sessão — guardado só no localStorage do próprio
--      browser. UUID é segredo não-adivinhável; mesmo modelo de ameaça dos
--      links não-listados (migration 032). As policies "..._select_own"
--      continuam valendo pro caso logado, intactas.
--
-- Reversão: `alter table chat_sessions alter column user_id set not null;`
-- (depois de apagar as linhas anônimas) e drop das duas policies _anon.

alter table chat_sessions alter column user_id drop not null;

drop policy if exists "chat_sessions_select_anon" on chat_sessions;
create policy "chat_sessions_select_anon" on chat_sessions
  for select using (user_id is null);

drop policy if exists "chat_messages_select_anon" on chat_messages;
create policy "chat_messages_select_anon" on chat_messages
  for select using (
    exists (
      select 1 from chat_sessions cs
      where cs.id = chat_messages.session_id and cs.user_id is null
    )
  );
