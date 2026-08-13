/**
 * Flag reversível: permite (ou não) que usuário NÃO logado use o chat do
 * Gambito e chame as ferramentas. Público (NEXT_PUBLIC_) porque tanto a API
 * route (app/api/chat/message/route.ts) quanto o widget
 * (components/chat/chat-widget.tsx) precisam do mesmo valor.
 *
 * Default OFF — comportamento antigo (chat só pra logado, 401 no endpoint).
 * Pra ligar: NEXT_PUBLIC_CHAT_ALLOW_ANONYMOUS=true no .env.local e na Vercel.
 * Pra reverter: volta pra false (nenhuma sessão anônima nova nasce; a
 * migration 067 fica inerte).
 */
export const CHAT_ALLOW_ANONYMOUS = process.env.NEXT_PUBLIC_CHAT_ALLOW_ANONYMOUS === 'true';
