import { test, expect, type Page } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { createTournament } from './utils/tournament';

/**
 * Smoke test de ponta a ponta da regra de partição de classificação — o
 * motivo de existir a migration 035: idade + feminina marcadas geram
 * "Sub-17" e "Sub-17 Feminino" (não uma "Feminino" avulsa), e cada jogador
 * cai em exatamente uma delas, por derivação a partir de birth_year/sexo.
 *
 * Roda sem passar pelo tour (localStorage pré-marcado como dispensado) —
 * este teste cobre a funcionalidade, não o guia; e.g/tour.spec.ts cobre o tour.
 */

async function login(page: Page, org: TestOrganizer) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(org.email);
  await page.getByLabel('Senha').fill(org.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/admin');
}

function slugFromUrl(page: Page): string {
  const match = page.url().match(/\/admin\/tournaments\/([^/]+)\//);
  if (!match) throw new Error(`URL sem slug de torneio: ${page.url()}`);
  return match[1];
}

async function register(page: Page, slug: string, opts: { fullName: string; birthYear: number; sex?: 'm' | 'w' }) {
  await page.goto(`/tournaments/${slug}/register`);
  await page.getByLabel('Nome completo *').fill(opts.fullName);
  await page.getByLabel('Ano de nascimento').fill(String(opts.birthYear));
  if (opts.sex) await page.getByLabel('Sexo').selectOption(opts.sex);
  await page.getByRole('button', { name: 'Enviar inscrição' }).click();
  await expect(page.getByText('Inscrição enviada!')).toBeVisible();
}

test.describe('ciclo de vida do torneio — classificação, inscrição, rodada', () => {
  let org: TestOrganizer;

  test.beforeEach(async ({ page }) => {
    org = await createTestOrganizer();
    // Dispensa o tour antes de qualquer navegação — este teste verifica
    // funcionalidade, o localStorage precisa existir antes do primeiro mount
    // de TournamentTour (app/admin/layout.tsx).
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('xbr_tour_criar_torneio_dispensado', '1'));
  });

  test.afterEach(async () => {
    await deleteTestOrganizer(org.id);
  });

  test('Sub-17 + Sub-17 Feminino, dois jogadores, emparceiramento único, 1ª rodada', async ({ page }) => {
    // Este teste visita ~8 rotas distintas; em dev cada uma compila sob
    // demanda na primeira visita, e o timeout padrão (90s no config) não
    // sobra o bastante quando várias delas são "primeira vez" na mesma run.
    test.setTimeout(240_000);

    await login(page, org);
    await page.goto('/admin/tournaments/new');
    await createTournament(page, `E2E Lifecycle ${Date.now()}`);
    const slug = slugFromUrl(page);

    // --- Classificação: idade (Sub-17) + feminina ---
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sim', exact: true }).click();
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sub-17', exact: true }).click();
    await page.locator('[data-tour="pergunta-feminina"]').getByRole('button', { name: 'Sim', exact: true }).click();
    await page.getByRole('button', { name: 'Gerar classificações' }).click();

    // generate() encadeia 3 mutações assíncronas (setDimensions, bulkCreate,
    // refreshCategories) antes do React Query invalidar e as linhas
    // aparecerem — sem esperar, a leitura corre na frente da UI.
    await expect(page.locator('div.card.p-3')).toHaveCount(2, { timeout: 15_000 });

    const categoryNames = await page.locator('div.card.p-3 input').evaluateAll(
      (els) => els.map((el) => (el as HTMLInputElement).value)
    );
    // A célula com zero critérios não vira linha — é o Geral, implícito. Só
    // as duas células com pelo menos um critério aparecem.
    expect(categoryNames.sort()).toEqual(['Sub-17', 'Sub-17 Feminino']);

    // --- Emparceiramento: todos juntos ---
    await page.getByRole('button', { name: 'Não — todos juntos' }).click();
    await page.getByRole('button', { name: 'Salvar emparceiramento' }).click();
    await expect(page.getByText('✓ Salvo')).toBeVisible();

    // --- Publicar: torneio nasce 'draft', e /register só abre inscrição com
    //     status === 'registration' (app/tournaments/[slug]/register/page.tsx).
    //     Sem datas de período configuradas, avançar o status já basta.
    await page.goto(`/admin/tournaments/${slug}/edit`);
    await page.getByRole('button', { name: 'Avançar →' }).click();
    await expect(page.getByText('✓ Salvo')).toBeVisible();

    // --- Dois jogadores, mesma idade, sexos diferentes ---
    await register(page, slug, { fullName: `E2E Menina ${Date.now()}`, birthYear: 2010, sex: 'w' });
    await register(page, slug, { fullName: `E2E Menino ${Date.now()}`, birthYear: 2010, sex: 'm' });

    // --- Aprovar as duas inscrições ---
    await login(page, org); // register() navegou pra páginas públicas; volta autenticado
    await page.goto(`/admin/tournaments/${slug}/registrations`);
    const pendingCards = page.locator('div.card', { hasText: 'Aprovar' });
    await expect(pendingCards).toHaveCount(2);
    // Aprova uma de cada vez — a lista reordena/filtra após cada aprovação.
    await pendingCards.first().getByRole('button', { name: 'Aprovar' }).click();
    await expect(pendingCards).toHaveCount(1, { timeout: 10_000 });
    await pendingCards.first().getByRole('button', { name: 'Aprovar' }).click();
    await expect(pendingCards).toHaveCount(0, { timeout: 10_000 });

    // --- Regra central: a menina cai só em Sub-17 Feminino, o menino só em Sub-17 ---
    await page.goto(`/admin/tournaments/${slug}/players`);
    const girlRow = page.locator('div.px-4.py-3', { hasText: 'E2E Menina' });
    const boyRow = page.locator('div.px-4.py-3', { hasText: 'E2E Menino' });
    await expect(girlRow).toContainText('Sub-17 Feminino');
    await expect(boyRow).toContainText('Sub-17');
    await expect(boyRow).not.toContainText('Feminino');

    // --- Ranking inicial + 1ª rodada ---
    await page.goto(`/admin/tournaments/${slug}/rounds`);
    await page.getByRole('button', { name: 'Gerar ranking inicial' }).click();
    await expect(page.getByText('Com seed: 2')).toBeVisible();
    await page.getByRole('button', { name: /Gerar rodada 1 de \d+/ }).click();
    // O card da rodada (native-rounds.tsx RoundCard) é um <button> cujo nome
    // acessível inclui "Rodada 1" + o texto do badge de status — getByText
    // solto bate em 3 elementos (aviso de seed, ausências, botão de gerar).
    // Gerar pareamento roda o motor de pareamento no servidor — mais lento
    // que uma mutação comum, o timeout padrão de 5s não é confiável aqui.
    await expect(page.getByRole('button', { name: /^Rodada 1\b/ })).toBeVisible({ timeout: 20_000 });
  });
});
