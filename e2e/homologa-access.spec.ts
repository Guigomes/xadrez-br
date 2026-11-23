import { randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { adminClient } from './utils/admin';
import { deleteUserByEmail } from './utils/auth';

/**
 * Homologação aberta, mas só contas da LOGIN_ALLOWLIST usam o site logadas
 * (lib/auth/login-allowlist.ts). Conta fora da lista: ao entrar vai para
 * /entrar?bloqueado=1 (aviso + sessão encerrada); com sessão ativa, toda
 * página logada volta ao aviso e toda API responde 403.
 *
 * Só faz sentido onde a lista está ligada: roda quando E2E_BASE_URL aponta
 * para a homologação.
 */
test.describe('acesso à homologação', () => {
  test.skip(!process.env.E2E_BASE_URL?.includes('homologa'), 'só na homologação (LOGIN_ALLOWLIST)');
  const email = `xbr.fora.da.lista.${Date.now()}.${randomUUID().slice(0, 8)}@gmail.com`;
  const password = `E2e-${randomUUID()}`;

  test.beforeAll(async () => {
    const { error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'E2E Fora da Lista' } });
    if (error) throw error;
  });
  test.afterAll(async () => { await deleteUserByEmail(email); });

  test('conta fora da lista entra e recebe o aviso, já desconectada', async ({ page }) => {
    await page.goto('/entrar?metodo=email');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Senha').fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL(/\/entrar\?bloqueado=1/, { timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'versão de testes' })).toBeVisible();
    await expect.poll(async () => (await page.context().cookies()).some((c) => c.name.includes('-auth-token')), { timeout: 15_000 }).toBe(false);
  });

  test('com a sessão ativa, API responde 403 e página logada volta ao aviso', async ({ page, baseURL }) => {
    await addSessionCookies(page.context(), baseURL!, email, password);

    const api = await page.request.get('/api/groups');
    expect(api.status()).toBe(403);
    expect(await api.text()).toContain('versão de testes');

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/entrar\?bloqueado=1/, { timeout: 30_000 });
  });

  test('página pública continua aberta sem login', async ({ page }) => {
    const response = await page.goto('/historico');
    expect(response?.status()).toBe(200);
  });
});

/** Entra pelo Supabase com o mesmo formato de cookie do app (@supabase/ssr) e grava no navegador. */
async function addSessionCookies(context: BrowserContext, baseURL: string, email: string, password: string) {
  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) {
          const i = jar.findIndex((x) => x.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await context.addCookies(jar.map((c) => ({ ...c, url: baseURL })));
}
