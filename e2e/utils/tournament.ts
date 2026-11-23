import type { Page } from '@playwright/test';

/**
 * Preenche e submete o formulário de criação de torneio com o mínimo
 * necessário pra passar na validação (components/tournament/tournament-form.tsx).
 * Responde "Sim" pra inscrição gratuita, pra não precisar lidar com o bloco
 * de comprovante de pagamento nos testes de inscrição.
 *
 * "Ritmo de jogo" é um select de presets (lib/utils/time-control.ts) desde a
 * migration 061 — escolher o preset grava o texto exibido e o time_control_kind.
 */
export async function createTournament(page: Page, name: string, opts: { timeControl?: string; startDate?: string } = {}) {
  await page.getByLabel('Nome do torneio *').fill(name);
  await page.getByLabel('Cidade *').fill('São Paulo');
  await page.getByLabel('Estado *').selectOption('SP');
  await page.getByLabel('Organizador *').fill('E2E Test Organizer');
  await page.getByLabel('Ritmo de jogo *').selectOption(opts.timeControl ?? 'G/15+10');
  await page.getByLabel('Data de início *').fill(opts.startDate ?? futureDate(30));
  await page.locator('[data-tour="pergunta-gratuita"]').getByRole('button', { name: 'Sim', exact: true }).click();
  await page.getByRole('button', { name: 'Criar torneio' }).click();
  // Pousa direto no Emparceiramento (?criado=1 abre o aviso lá), não em
  // /edit — ver app/admin/torneios/novo/page.tsx.
  await page.waitForURL(/\/admin\/torneios\/[^/]+\/emparceiramento/);
}

/** Data AAAA-MM-DD daqui a `days` dias (torneio no futuro não muda de status sozinho). */
export function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
