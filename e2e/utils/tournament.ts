import type { Page } from '@playwright/test';

/**
 * Preenche e submete o formulário de criação de torneio com o mínimo
 * necessário pra passar na validação (components/tournament/tournament-form.tsx).
 * Responde "Sim" pra inscrição gratuita, pra não precisar lidar com o bloco
 * de comprovante de pagamento nos testes de inscrição.
 */
export async function createTournament(page: Page, name: string) {
  await page.getByLabel('Nome do torneio *').fill(name);
  await page.getByLabel('Cidade *').fill('São Paulo');
  await page.getByLabel('Estado *').selectOption('SP');
  await page.getByLabel('Organizador *').fill('E2E Test Organizer');
  await page.getByLabel('Ritmo de jogo *').fill('G/30+10');
  await page.getByLabel('Data de início *').fill('2026-12-01');
  await page.locator('[data-tour="pergunta-gratuita"]').getByRole('button', { name: 'Sim', exact: true }).click();
  await page.getByRole('button', { name: 'Criar torneio' }).click();
  await page.waitForURL(/\/admin\/tournaments\/[^/]+\/edit/);
}
