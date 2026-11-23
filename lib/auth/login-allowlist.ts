/**
 * Lista de contas que podem usar o site neste ambiente (homologação).
 *
 * `LOGIN_ALLOWLIST` (env da Vercel, só no ambiente de prévia): e-mails
 * separados por vírgula; `*` vale qualquer trecho (ex.: `xbr.e2e.*@gmail.com`).
 * Sem a variável (produção, dev local) todo mundo entra.
 *
 * Por quê: a homologação fica aberta na internet e usa o MESMO banco da
 * produção, com a chave SANDBOX do Asaas — sem a lista, qualquer pessoa
 * "pagaria" uma assinatura de teste e ficaria com ela ativa no site real.
 * Páginas: middleware.ts manda quem não está na lista para /entrar?bloqueado=1
 * (que encerra a sessão). APIs: requireUser (lib/api/guards.ts) responde 403.
 */
export function loginAllowlist(): string[] | null {
  const raw = process.env.LOGIN_ALLOWLIST?.trim();
  if (!raw) return null;
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isLoginAllowed(email: string | null | undefined, list = loginAllowlist()): boolean {
  if (!list) return true;
  const value = (email ?? '').trim().toLowerCase();
  if (!value) return false;
  return list.some((pattern) => {
    if (!pattern.includes('*')) return pattern === value;
    const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return re.test(value);
  });
}

export const LOGIN_BLOCKED_MESSAGE =
  'Esta é a versão de testes do Gambito e só contas autorizadas entram aqui. Use gambitotorneios.com.br.';
