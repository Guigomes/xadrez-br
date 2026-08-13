/**
 * Trava de cadastro durante o beta fechado.
 *
 * Enquanto a lista não for `null`, só os e-mails nela conseguem criar conta
 * nova pela tela de cadastro. Login de conta já existente NÃO é afetado.
 *
 * Reverter (abrir o cadastro pra todo mundo): `BETA_SIGNUP_ALLOWLIST = null`.
 *
 * ATENÇÃO — isto é uma trava de PRODUTO, não de segurança: a checagem roda no
 * navegador, e o app fala direto com o Supabase Auth com a chave anônima (que
 * é pública). Quem chamar a API de signup por fora da tela continua criando
 * conta. Se algum dia precisar valer de verdade, o ponto certo é o trigger
 * `handle_new_user` (supabase/migrations/027_participant_capability.sql), que
 * roda dentro da transação do insert em auth.users — com a ressalva de que
 * isso também bloquearia a criação de usuário dos testes e2e
 * (e2e/utils/test-user.ts, que usa a Admin API).
 */
export const BETA_SIGNUP_ALLOWLIST: string[] | null = ['chesskingbr@gmail.com'];

export const BETA_SIGNUP_MESSAGE =
  'O sistema ainda está em fase de testes fechada — por enquanto não é possível criar contas novas. Se você já tem conta, é só entrar.';

/** Normaliza igual pros dois lados: e-mail não diferencia caixa, e espaço colado junto é acidente. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canSignUp(email: string): boolean {
  if (BETA_SIGNUP_ALLOWLIST === null) return true;
  return BETA_SIGNUP_ALLOWLIST.map(normalizeEmail).includes(normalizeEmail(email));
}
