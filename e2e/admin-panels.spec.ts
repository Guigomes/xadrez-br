import { test, expect } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { adminClient } from './utils/admin';

/**
 * Smoke test dos painéis novos de admin (/admin/dev/errors,
 * /admin/dev/unanswered, /admin/dev/chat) — só confirma que carregam sem
 * quebrar pra quem é role='admin'. Cria um organizador de teste e promove
 * pra admin na hora (revertido no cleanup).
 */
test.describe('painéis admin novos', () => {
  let org: TestOrganizer;

  test.beforeEach(async ({ page }) => {
    org = await createTestOrganizer();
    await adminClient().from('user_profiles').update({ role: 'admin' }).eq('id', org.id);
    await page.goto('/login');
    await page.getByLabel('Email').fill(org.email);
    await page.getByLabel('Senha').fill(org.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/admin');
  });

  test.afterEach(async () => {
    await deleteTestOrganizer(org.id);
  });

  test('painel de erros carrega', async ({ page }) => {
    await page.goto('/admin/dev/errors');
    await expect(page.getByText('Log de erros')).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('painel de perguntas sem resposta carrega', async ({ page }) => {
    await page.goto('/admin/dev/unanswered');
    await expect(page.getByText('Perguntas sem resposta')).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('painel de histórico do chat carrega', async ({ page }) => {
    await page.goto('/admin/dev/chat');
    await expect(page.getByText('Histórico do Gambito')).toBeVisible();
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
  });

  test('painel dev mostra os links das seções', async ({ page }) => {
    await page.goto('/admin/dev');
    await expect(page.getByRole('link', { name: /histórico de conversas/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /erros não esperados/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /não conseguiu responder/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /publicar notícias/i })).toBeVisible();
  });

  // Fluxo completo de notícia (migration 059): criar rascunho, editar,
  // publicar, ver no site público, despublicar (volta a dar 404) e excluir.
  test('publica e despublica uma notícia', async ({ page, browser }) => {
    const title = `E2E Notícia ${Date.now()}`;

    await page.goto('/admin/dev/noticias');
    await expect(page.getByText('Acesso restrito')).not.toBeVisible();
    await page.getByRole('button', { name: '+ Nova notícia' }).click();
    await page.getByLabel('Título *').fill(title);
    await page.getByRole('button', { name: 'Criar rascunho' }).click();

    // Redireciona pro editor da notícia recém-criada.
    await page.waitForURL(/\/admin\/dev\/noticias\/[0-9a-f-]{36}$/);
    const slug = new URL(page.url()).pathname.split('/').pop()!;
    await expect(page.getByText('Rascunho')).toBeVisible();

    // O slug público sai do título, não do id da URL.
    const publicSlug = await page.getByLabel('Endereço (slug)').inputValue();

    await page.getByRole('textbox', { name: /Escreva em Markdown/i })
      .or(page.locator('textarea'))
      .first()
      .fill('Corpo da **notícia** de teste.');
    // Timeout folgado: a 1ª chamada de cada rota compila sob demanda no dev
    // server (~5s medidos), bem acima do padrão de 5s do expect.
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('✓ Salvo')).toBeVisible({ timeout: 20_000 });

    // Contexto anônimo de propósito: `page` está logado como admin, e a
    // policy news_select_admin (migration 059) deixa admin ler rascunho —
    // testar a visibilidade pública ali daria falso positivo.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();

    // Público enxerga a publicada…
    await anonPage.goto(`/noticias/${publicSlug}`);
    await expect(anonPage.getByRole('heading', { name: title })).toBeVisible();

    // …e para de enxergar depois de despublicar.
    await page.goto(`/admin/dev/noticias/${slug}`);
    await page.getByRole('button', { name: 'Despublicar' }).click();
    await expect(page.getByText('✓ Salvo')).toBeVisible({ timeout: 20_000 });
    await anonPage.goto(`/noticias/${publicSlug}`);
    await expect(anonPage.getByText('Página não encontrada')).toBeVisible();
    await anon.close();

    // Limpa: sem isso cada rodada deixa um rascunho no banco de produção.
    await page.goto(`/admin/dev/noticias/${slug}`);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Excluir' }).click();
    await page.waitForURL('**/admin/dev/noticias');
  });
});
