import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Carrega .env.local — Playwright não faz isso sozinho como o Next faz.
// dotenv/config puro carregaria .env, não .env.local; precisa do path explícito.
config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
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
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    navigationTimeout: 60_000,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
