import type { Page } from '@playwright/test';
import { adminClient } from './admin';

/**
 * Login pela tela, com o formulário de e-mail aberto.
 *
 * Em produção/homologação só o Google aparece; `?metodo=email` abre o
 * formulário de e-mail (app/[locale]/entrar/page.tsx) — e no dev local também
 * evita o clique extra em "Entrar com e-mail".
 */
export async function loginByEmail(page: Page, email: string, password: string) {
  await page.goto('/entrar?metodo=email');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/admin');
}

/** Dispensa o tour de criação antes do primeiro mount (o teste cobre a função, não o guia). */
export async function dismissTour(page: Page) {
  await page.goto('/entrar?metodo=email');
  await page.evaluate(() => localStorage.setItem('xbr_tour_criar_torneio_dispensado', '1'));
}

/** Apaga uma conta pelo e-mail (e os torneios dela), se existir. */
export async function deleteUserByEmail(email: string) {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data?.users.find((u) => u.email === email);
  if (!user) return;
  await admin.from('tournaments').delete().eq('created_by', user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUserByEmail: ${error.message}`);
}
