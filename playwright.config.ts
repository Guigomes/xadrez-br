import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Carrega .env.local — Playwright não faz isso sozinho como o Next faz.
// dotenv/config puro carregaria .env, não .env.local; precisa do path explícito.
config({ path: '.env.local' });

/**
 * Dois alvos:
 * - padrão: sobe o `next dev` local (http://localhost:3000);
 * - `E2E_BASE_URL=https://homologa.gambitotorneios.com.br`: roda contra o site
 *   já publicado, sem servidor local. A homologação fica atrás da proteção da
 *   Vercel: passe `E2E_VERCEL_SHARE` (token `_vercel_share` de um link de
 *   compartilhamento) e o global-setup grava o cookie de acesso.
 * `E2E_BROWSER_CHANNEL=msedge|chrome` usa o navegador já instalado na máquina
 * em vez de baixar o Chromium do Playwright.
 */
const remote = process.env.E2E_BASE_URL;
const baseURL = remote ?? 'http://localhost:3000';
const channel = process.env.E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // cada teste cria/apaga sua própria conta no Supabase real
  // fullyParallel só serializa dentro de um arquivo — sem workers:1, specs
  // diferentes ainda rodam em paralelo e disputam o mesmo dev server. Isso
  // causou os dois arquivos navegarem pra /admin/tournaments/new ao mesmo
  // tempo, batendo na primeira compilação da rota junto e estourando o
  // Fast Refresh full reload no meio do teste.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  // next dev compila cada rota sob demanda na primeira visita — a primeira
  // navegação pra uma rota nunca antes acessada nesta execução pode levar
  // bem mais que os 30s padrão do Playwright. O timeout do teste cobre isso;
  // navigationTimeout cobre especificamente o waitForURL após submits.
  timeout: 90_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    navigationTimeout: 60_000,
    storageState: 'e2e/.auth/vercel.json',
  },
  webServer: remote
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Os testes logam pelo form de e-mail/senha, que em produção fica escondido.
        env: { ...process.env, NEXT_PUBLIC_EMAIL_LOGIN: 'true' } as Record<string, string>,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', ...(channel ? { channel } : {}) } }],
});
