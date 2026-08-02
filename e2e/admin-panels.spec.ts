import { test, expect } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { adminClient } from './utils/admin';

/**
 * Smoke test dos painéis novos de admin (/admin/dev/errors,
 * /admin/dev/unanswered, /admin/dev/chat) — só confirma que carregam sem
 * quebrar pra quem é role='admin'. Cria um organizador de teste e promove
 * pra admin na hora (revertido no cleanup).
 */
test.describe('painéis admin novos', () => {
  let org: TestOrganizer;

  test.beforeEach(async ({ page }) => {
    org = await createTestOrganizer();
    await adminClient().from('user_profiles').update({ role: 'admin' }).eq('id', org.id);
    await page.goto('/login');
    await page.getByLabel('Email').fill(org.email);
    await page.getByLabel('Senha').fill(org.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/admin');
  });

  test.afterEach(async () => {
    await deleteTestOrganizer(org.id);
  });

  test('painel de erros carrega', async ({ page }) => {
    await page.goto('/admin/dev/errors');
    await expect(page.getByText('Log de erros')).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('painel de perguntas sem resposta carrega', async ({ page }) => {
    await page.goto('/admin/dev/unanswered');
    await expect(page.getByText('Perguntas sem resposta')).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('painel de histórico do chat carrega', async ({ page }) => {
    await page.goto('/admin/dev/chat');
    await expect(page.getByText('Histórico do Gambito')).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('painel dev mostra os 3 links novos', async ({ page }) => {
    await page.goto('/admin/dev');
    await expect(page.getByRole('link', { name: /histórico de conversas/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /erros não esperados/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /não conseguiu responder/i })).toBeVisible();
  });
});
