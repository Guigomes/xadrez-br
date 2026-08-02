-- Chatbot de suporte — Fase 3: escalonamento para humano (adaptado do plano
-- original em docs/plano-chatbot-suporte.md §6/§7). Diferenças da proposta:
--
-- 1. Sem Realtime (o plano já sinalizava como maior risco técnico do
--    projeto, nunca usado aqui) — widget e painel usam polling simples
--    (refetchInterval) enquanto a sessão está em atendimento humano.
-- 2. Resposta do humano é gravada com role='assistant', igual a resposta do
--    bot — decisão do usuário: a ilusão de "é sempre o Gambito" não pode
--    quebrar pro usuário final. `is_human` guarda a distinção só pra você
--    revisar depois no histórico (/admin/dev/chat), nunca é lido pelo widget.
-- 3. `escalated_at` já existia no design original; some com o timeout do
--    lado do cliente (3 min sem resposta humana) pra pedir telefone.

alter type chat_session_status add value if not exists 'aguardando_humano';
alter type chat_session_status add value if not exists 'humano';

alter table chat_sessions add column if not exists escalated_at timestamptz;
alter table chat_sessions add column if not exists contact_phone text;

alter table chat_messages add column if not exists is_human boolean not null default false;
