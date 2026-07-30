import { test, expect } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { createTournament } from './utils/tournament';

/**
 * Cobre o tour guiado de criação de torneio (components/admin/tournament-tour.tsx)
 * de ponta a ponta — /admin → /new → /groups → /players — algo que não foi
 * possível verificar manualmente porque o painel de preview usado durante o
 * desenvolvimento não composita frames (document.hidden=true trava o
 * requestAnimationFrame de que o streaming SSR do Next depende).
 */

async function login(page: import('@playwright/test').Page, org: TestOrganizer) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(org.email);
  await page.getByLabel('Senha').fill(org.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/(admin)?$/);
}

const popoverTitle = (page: import('@playwright/test').Page) => page.locator('.driver-popover-title');
const nextBtn = (page: import('@playwright/test').Page) => page.locator('.driver-popover-next-btn');

test.describe.serial('tour guiado de criação de torneio', () => {
  let org: TestOrganizer;

  test.beforeAll(async () => {
    org = await createTestOrganizer();
  });

  test.afterAll(async () => {
    await deleteTestOrganizer(org.id);
  });

  test('percorre os 4 passos da rota /new, pula o passo opcional em /groups e termina em /players', async ({ page }) => {
    await login(page, org);
    await page.goto('/admin');

    // O tour abre sozinho: conta nova, zero torneios. Primeiro passo é a tela
    // de boas-vindas — sem alvo, botão próprio "Começar" em vez de "Próximo".
    await expect(popoverTitle(page)).toHaveText('Bem-vindo! 👋');
    await page.locator('.driver-popover-next-btn', { hasText: 'Começar' }).click();
    await expect(popoverTitle(page)).toHaveText('Tudo começa aqui');

    // O alvo do passo seguinte é o próprio link "Novo torneio" — clicar
    // nele é a saída natural (o tour não navega sozinho). O componente
    // TournamentTour não desmonta nessa transição (mesmo layout /admin), só
    // reage à mudança de pathname.
    await page.locator('[data-tour="novo-torneio"]').click();
    await page.waitForURL(/\/admin\/tournaments\/new/);

    // 7 passos em /new: info-basica, organizacao, formato, pergunta-gratuita,
    // gerenciamento, visibilidade, criar.
    await expect(popoverTitle(page)).toHaveText('Informações básicas');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Quem responde pelo torneio');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Formato do torneio');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Cobrança');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Ranking e desempate');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Quem pode ver');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Criar e continuar');
    // Último passo do bloco — o botão é "Entendi" (continues=true), não "Próximo".
    await page.locator('.driver-popover-next-btn', { hasText: 'Entendi' }).click();
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    // O tour não preenche nada — o organizador preenche de verdade e segue.
    await createTournament(page, `E2E Tour ${Date.now()}`);

    // /groups: retoma sozinho no primeiro passo do bloco.
    await expect(popoverTitle(page)).toHaveText('Duas coisas diferentes');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Separar por idade?');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Separar por rating?');
    await nextBtn(page).click();
    await expect(popoverTitle(page)).toHaveText('Classificação feminina?');
    await nextBtn(page).click();

    // Regressão-chave: sem marcar "Sim" em nenhuma pergunta, o card "Gerar
    // classificações" nunca existiu no DOM — skipMissingElement precisa pular
    // esse passo e ir direto pro de emparceiramento, sem travar nem contar
    // um passo a mais na barra de progresso.
    await expect(popoverTitle(page)).toHaveText('Quem joga contra quem');
    await page.locator('.driver-popover-next-btn', { hasText: 'Entendi' }).click();
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    // Navegação real: o organizador clica na aba, o tour não pula sozinho.
    // "Agora falta gente" mora em Inscrições agora — o link de inscrição
    // saiu de Participantes.
    await page.getByRole('link', { name: 'Inscrições' }).click();
    await page.waitForURL(/\/admin\/tournaments\/[^/]+\/registrations/);

    await expect(popoverTitle(page)).toHaveText('Agora falta gente');
    // Último passo do bloco de Inscrições — botão "Entendi", não "Próximo".
    await page.locator('.driver-popover-next-btn', { hasText: 'Entendi' }).click();
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    await page.getByRole('link', { name: 'Participantes' }).click();
    await page.waitForURL(/\/admin\/tournaments\/[^/]+\/players/);

    await expect(popoverTitle(page)).toHaveText('Ou cadastre você mesmo');
    // Último passo do tour inteiro — nextStepAfter('cadastrar') é null, então
    // o botão é "Concluir", não "Entendi".
    await page.locator('.driver-popover-next-btn', { hasText: 'Concluir' }).click();
    await expect(page.locator('.driver-popover')).toHaveCount(0);

    // Torneio criado nesta conta: reabrir /admin não deve reabrir o tour.
    await page.goto('/admin');
    await page.waitForTimeout(500);
    await expect(page.locator('.driver-popover')).toHaveCount(0);
  });

  test('dispensa persiste; botão de ajuda reabre do início', async ({ page }) => {
    const org2 = await createTestOrganizer();
    try {
      await login(page, org2);
      await page.goto('/admin');

      await expect(popoverTitle(page)).toHaveText('Bem-vindo! 👋');
      await page.keyboard.press('Escape');
      await expect(page.locator('.driver-popover')).toHaveCount(0);

      // Dispensa é permanente (localStorage) — recarregar não reabre.
      await page.reload();
      await page.waitForTimeout(500);
      await expect(page.locator('.driver-popover')).toHaveCount(0);

      // Não sobrou botão de ajuda em /admin de propósito — achar "Novo
      // torneio" não é o ponto de confusão. O botão de rever mora na tela de
      // criar torneio e dentro de um torneio já existente.
      await page.goto('/admin/tournaments/new');
      await page.getByRole('button', { name: 'Dicas de como criar um torneio' }).click();
      await expect(popoverTitle(page)).toHaveText('Informações básicas');
    } finally {
      await deleteTestOrganizer(org2.id);
    }
  });
});
