import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Prepara o storageState usado por todos os testes (e2e/.auth/vercel.json).
 *
 * Contra o site publicado com proteção da Vercel (homologação), abre o link de
 * compartilhamento uma vez (`?_vercel_share=<token>`): a Vercel responde com o
 * cookie de acesso, que fica salvo e vai junto em toda página dos testes.
 * Sem `E2E_VERCEL_SHARE` (dev local), grava um estado vazio.
 */
export default async function globalSetup(config: FullConfig) {
  const path = 'e2e/.auth/vercel.json';
  mkdirSync('e2e/.auth', { recursive: true });
  const token = process.env.E2E_VERCEL_SHARE;
  const project = config.projects[0];
  const baseURL = project.use.baseURL;
  if (!token || !baseURL) {
    writeFileSync(path, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  const browser = await chromium.launch(project.use.channel ? { channel: project.use.channel } : {});
  const page = await browser.newPage();
  await page.goto(`${baseURL}/?_vercel_share=${encodeURIComponent(token)}`);
  if (page.url().includes('vercel.com/login')) {
    await browser.close();
    throw new Error('E2E_VERCEL_SHARE não liberou o acesso: o link de compartilhamento expirou ou é de outro deploy.');
  }
  await page.context().storageState({ path });
  await browser.close();
}
