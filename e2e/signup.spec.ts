import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { adminClient } from './utils/admin';
import { deleteUserByEmail } from './utils/auth';

/**
 * Cadastro de usuário pela tela (/entrar → "Não tem conta? Cadastre-se").
 *
 * Confirmação de e-mail está desligada no Supabase Auth deste projeto: a conta
 * nasce pronta, e o teste entra com ela em seguida. Toda conta pode organizar
 * (migration 20261116120000), então depois do login a pessoa cai no painel.
 *
 * Roda contra o Supabase real (o mesmo da produção): a conta é apagada no fim,
 * passe ou falhe.
 */
test.describe('cadastro de usuário', () => {
  const email = `xbr.e2e.cadastro.${Date.now()}.${randomUUID().slice(0, 8)}@gmail.com`;
  const password = `E2e-${randomUUID()}`;
  const fullName = `E2E Cadastro ${Date.now()}`;

  test.afterAll(async () => {
    await deleteUserByEmail(email);
  });

  test('cria a conta pela tela, entra e chega ao painel', async ({ page }) => {
    await page.goto('/entrar?metodo=email');
    // O link aparece duas vezes (abaixo do Google e no fim do formulário de e-mail).
    await page.getByRole('button', { name: 'Não tem conta? Cadastre-se' }).first().click();
    await expect(page.getByText('Criar sua conta')).toBeVisible();

    await page.getByLabel('Nome completo').fill(fullName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Senha').fill(password);
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByText('Conta criada!')).toBeVisible({ timeout: 20_000 });

    // A conta existe no Auth e o trigger handle_new_user criou o perfil com o nome.
    const admin = adminClient();
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = list.users.find((u) => u.email === email);
    expect(user, 'conta criada no Supabase Auth').toBeTruthy();
    const { data: profile } = await admin.from('user_profiles').select('full_name, role').eq('id', user!.id).single();
    expect(profile?.full_name).toBe(fullName);
    expect(profile?.role).not.toBe('admin');

    // Depois do cadastro a tela volta para "Entrar" com o e-mail preenchido.
    await page.getByLabel('Senha').fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL('**/admin');
    await expect(page.getByRole('link', { name: /Novo torneio|Criar torneio/ }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('não aceita entrar com senha errada', async ({ page }) => {
    await page.goto('/entrar?metodo=email');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText(/inválid|incorret|Invalid/i)).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/entrar/);
  });
});
