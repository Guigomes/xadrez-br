import { test, expect, type Page } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';

/**
 * Smoke test do chatbot de suporte: widget só aparece logado, manda pergunta,
 * espera resposta real do provedor configurado (Gemini, ver lib/chat/llm.ts)
 * com base na KB indexada em kb_chunks.
 */

async function login(page: Page, org: TestOrganizer) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(org.email);
  await page.getByLabel('Senha').fill(org.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/admin');
}

test.describe('chatbot de suporte (Gambito)', () => {
  let org: TestOrganizer;

  test.beforeEach(async ({ page }) => {
    org = await createTestOrganizer();
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('xbr_tour_criar_torneio_dispensado', '1'));
  });

  test.afterEach(async () => {
    await deleteTestOrganizer(org.id);
  });

  test('responde pergunta com base na base de conhecimento', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page, org);

    // dispatchEvent, não click() — o painel do React Query Devtools (só em
    // dev, não existe em produção) fica sobreposto nesse canto e intercepta
    // o clique real do navegador; dispatchEvent dispara o handler direto,
    // sem depender de qual elemento está visualmente por cima.
    await page.getByRole('button', { name: 'Falar com o Gambito' }).dispatchEvent('click');
    await page.getByPlaceholder('Digite sua pergunta…').fill('como eu abro as inscrições do meu torneio?');
    await page.getByRole('button', { name: 'Enviar' }).click();

    // .justify-start é só o lado do Gambito (bolha do usuário é
    // .justify-end, tanto a otimista quanto a persistida) — sem esse filtro
    // .last() podia pegar a pergunta do próprio usuário por engano se ela
    // renderizasse por último num timing específico.
    const answer = page.locator('.justify-start p.whitespace-pre-wrap').last();
    await expect(answer).not.toHaveText('', { timeout: 30_000 });
    await expect(page.getByText('como eu abro as inscrições do meu torneio?')).toBeVisible();
    const text = await answer.textContent();
    console.log('RESPOSTA DO GAMBITO:', text);
    await page.screenshot({ path: 'test-results/gambito-chat-screenshot.png' });
    expect(text?.toLowerCase()).toContain('inscri');
  });
});
