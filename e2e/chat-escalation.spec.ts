import { test, expect, type Page } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { adminClient } from './utils/admin';

/**
 * Fluxo de escalonamento (Fase 3) de ponta a ponta: usuário pede atendente,
 * admin responde em /admin/dev/chat, usuário vê a resposta chegar via
 * polling — nunca verificado num navegador de verdade antes desse teste.
 * Dois contextos de página (dois "browsers") pro usuário e pro admin.
 *
 * Sessão/mensagem inicial seedadas direto no banco (não pelo widget) — não
 * depende de gastar uma das 20 chamadas/dia do free tier do Gemini só pra
 * ter um sessionId, o foco aqui é testar o escalonamento em si.
 */
test.describe('escalonamento pra atendimento humano', () => {
  let user: TestOrganizer;
  let adminUser: TestOrganizer;

  test.beforeEach(async () => {
    user = await createTestOrganizer();
    adminUser = await createTestOrganizer();
    await adminClient().from('user_profiles').update({ role: 'admin' }).eq('id', adminUser.id);
  });

  test.afterEach(async () => {
    await deleteTestOrganizer(user.id);
    await deleteTestOrganizer(adminUser.id);
  });

  async function login(page: Page, org: TestOrganizer) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(org.email);
    await page.getByLabel('Senha').fill(org.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/admin');
  }

  test('usuário escala, admin responde, usuário vê a resposta', async ({ browser }) => {
    test.setTimeout(90_000);

    const { data: session } = await adminClient()
      .from('chat_sessions').insert({ user_id: user.id }).select('id').single();
    const { error: msgError } = await adminClient()
      .from('chat_messages').insert({ session_id: session!.id, role: 'user', content: 'preciso de ajuda com um problema bem específico' });
    if (msgError) throw msgError;

    // addInitScript, não page.evaluate() depois do goto — o ChatWidget já
    // monta (e lê localStorage, só uma vez, no useEffect) na própria página
    // /login, antes de qualquer chance de setar valor via evaluate(); e como
    // ele não desmonta na navegação client-side pro /admin, o valor lido
    // tarde nunca mais é considerado. addInitScript roda antes do JS da
    // página em toda navegação nesse contexto.
    const userContext = await browser.newContext();
    await userContext.addInitScript((id) => {
      localStorage.setItem('xbr_chat_session_id', id);
      localStorage.setItem('xbr_tour_criar_torneio_dispensado', '1');
    }, session!.id);
    const userPage = await userContext.newPage();
    await userPage.goto('/login');
    await userPage.getByLabel('Email').fill(user.email);
    await userPage.getByLabel('Senha').fill(user.password);
    await userPage.getByRole('button', { name: 'Entrar' }).click();
    await userPage.waitForURL('**/admin');

    // Reload de propósito: como o widget já tem sessionId via localStorage
    // desde a 1ª carga pós-login (addInitScript), a query de mensagens pode
    // disparar antes do cliente Supabase do browser terminar de hidratar a
    // sessão de auth — corrida que o fluxo normal (sessionId só aparece
    // depois de mandar a 1ª mensagem, vários segundos de round-trip do
    // Gemini) nunca chega a expor. Reload garante o cookie de auth já
    // validado pelo servidor antes de qualquer fetch do client.
    await userPage.reload();
    await userPage.waitForLoadState('networkidle');

    await userPage.getByRole('button', { name: 'Falar com o Gambito' }).dispatchEvent('click');
    await expect(userPage.getByText('preciso de ajuda com um problema bem específico')).toBeVisible();

    await userPage.getByRole('button', { name: 'Falar com atendente' }).click();
    await expect(userPage.getByText('Já chamei alguém pra te ajudar')).toBeVisible({ timeout: 15_000 });

    // Admin abre o painel numa sessão separada e responde.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, adminUser);
    await adminPage.goto('/admin/dev/chat');
    await adminPage.getByText(user.email).click();
    await expect(adminPage.getByText('Aguardando você')).toBeVisible();

    const replyText = 'Oi! Sou eu, vou te ajudar com isso agora.';
    await adminPage.getByPlaceholder('Responder como Gambito…').fill(replyText);
    await adminPage.getByRole('button', { name: 'Enviar' }).click();
    await expect(adminPage.getByText(replyText)).toBeVisible({ timeout: 10_000 });

    // Usuário recebe via polling (até 3s de intervalo) — dá margem de 10s.
    await expect(userPage.getByText(replyText)).toBeVisible({ timeout: 10_000 });

    await userContext.close();
    await adminContext.close();
  });
});
