import { randomUUID } from 'node:crypto';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { createTournament } from './utils/tournament';
import { dismissTour, loginByEmail, deleteUserByEmail } from './utils/auth';
import { adminClient } from './utils/admin';

/**
 * Inscrição e aprovação de jogadores pela tela.
 *
 * Organizador cria e abre o torneio; três inscrições chegam pelo link público:
 * duas sem conta (uma será rejeitada) e uma de jogador logado. O organizador
 * aprova duas e rejeita uma com motivo. Confere no banco: participantes
 * criados no grupo, status das inscrições, motivo da rejeição e o vínculo
 * VERIFICADO entre a conta do jogador logado e o cadastro dele (é o que libera
 * a Minha área e a foto). Tudo criado aqui é apagado no fim.
 */
test.describe('inscrição e aprovação de jogadores', () => {
  let org: TestOrganizer;
  const run = Date.now();
  const anon = `E2E Inscrito Anônimo ${run}`;
  const rejected = `E2E Inscrito Rejeitado ${run}`;
  const member = `E2E Inscrito Com Conta ${run}`;
  const memberEmail = `xbr.e2e.jogador.${run}.${randomUUID().slice(0, 8)}@gmail.com`;
  const memberPassword = `E2e-${randomUUID()}`;
  let memberId = '';

  test.beforeAll(async () => {
    const { data, error } = await adminClient().auth.admin.createUser({
      email: memberEmail, password: memberPassword, email_confirm: true,
      user_metadata: { full_name: member },
    });
    if (error) throw error;
    memberId = data.user!.id;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    if (org) await deleteTestOrganizer(org.id); // torneio, inscrições e participantes (cascade)
    await admin.from('user_player_links').delete().eq('user_id', memberId);
    await deleteUserByEmail(memberEmail);
    await admin.from('players').delete().in('full_name', [anon, rejected, member]);
  });

  test('inscrições pelo link público, aprovação e rejeição pelo organizador', async ({ page, browser }) => {
    test.setTimeout(300_000);
    org = await createTestOrganizer();
    await dismissTour(page);
    await loginByEmail(page, org.email, org.password);

    // --- Organizador cria o torneio e abre as inscrições ---
    await page.goto('/admin/torneios/novo');
    await createTournament(page, `E2E Inscrições ${run}`);
    const slug = page.url().match(/\/admin\/torneios\/([^/]+)\//)![1];
    await page.getByRole('button', { name: 'Entendi' }).click();
    await page.goto(`/admin/torneios/${slug}/editar`);
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('button', { name: 'Abrir Inscrições' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Abrir Inscrições' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar Inscrições' })).toBeVisible({ timeout: 15_000 });

    // --- Inscrições: duas sem conta, uma com conta ---
    await registerAnonymously(browser, slug, { fullName: anon, birthYear: 2014, sex: 'm' });
    await registerAnonymously(browser, slug, { fullName: rejected, birthYear: 2013, sex: 'w' });
    await registerAsMember(browser, slug, { email: memberEmail, password: memberPassword, fullName: member, birthYear: 2015 });

    // --- Organizador aprova duas e rejeita uma ---
    await page.goto(`/admin/torneios/${slug}/inscricoes`);
    const card = (name: string) => page.locator('div.card', { hasText: name });
    await expect(page.getByRole('button', { name: /Pendentes \(3\)/ })).toBeVisible({ timeout: 30_000 });

    await card(anon).getByRole('button', { name: 'Aprovar' }).click();
    await expect(card(anon)).toHaveCount(0, { timeout: 15_000 });
    await card(member).getByRole('button', { name: 'Aprovar' }).click();
    await expect(card(member)).toHaveCount(0, { timeout: 15_000 });

    page.once('dialog', (dialog) => dialog.accept('Inscrição duplicada (teste)'));
    await card(rejected).getByRole('button', { name: 'Rejeitar' }).click();
    await expect(card(rejected)).toHaveCount(0, { timeout: 15_000 });

    await expect(page.getByRole('button', { name: /Pendentes \(0\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Aprovadas \(2\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Rejeitadas \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: /Rejeitadas/ }).click();
    await expect(page.getByText('Motivo: Inscrição duplicada (teste)')).toBeVisible();

    // --- Banco: participantes, status e vínculo da conta ---
    const admin = adminClient();
    const { data: t } = await admin.from('tournaments').select('id').eq('slug', slug).single();
    const { data: regs } = await admin.from('tournament_registrations')
      .select('full_name, status, rejected_reason').eq('tournament_id', t!.id);
    expect(Object.fromEntries((regs ?? []).map((r) => [r.full_name, r.status]))).toEqual({
      [anon]: 'approved', [member]: 'approved', [rejected]: 'rejected',
    });
    expect(regs!.find((r) => r.full_name === rejected)!.rejected_reason).toBe('Inscrição duplicada (teste)');

    const { data: tps } = await admin.from('tournament_players')
      .select('player_id, pairing_group_id, players(full_name, birth_year)').eq('tournament_id', t!.id);
    const names = (tps ?? []).map((tp) => (tp.players as unknown as { full_name: string }).full_name).sort();
    expect(names).toEqual([anon, member].sort());
    expect((tps ?? []).every((tp) => tp.pairing_group_id)).toBe(true);

    const memberPlayer = (tps ?? []).find((tp) => (tp.players as unknown as { full_name: string }).full_name === member)!;
    const { data: link } = await admin.from('user_player_links')
      .select('status').eq('user_id', memberId).eq('player_id', memberPlayer.player_id).maybeSingle();
    expect(link?.status).toBe('verified');

    // --- Lista pública de participantes mostra só os aprovados ---
    await page.goto(`/torneios/${slug}/participantes`);
    await expect(page.getByText(anon)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(member)).toBeVisible();
    await expect(page.getByText(rejected)).toHaveCount(0);
  });
});

/** Inscrição sem conta, num contexto limpo (sem a sessão do organizador). */
async function registerAnonymously(browser: Browser, slug: string, opts: { fullName: string; birthYear: number; sex: 'm' | 'w' }) {
  const context = await browser.newContext({ storageState: 'e2e/.auth/vercel.json' }); // cookie da proteção da Vercel, quando houver
  const page = await context.newPage();
  await fillRegistration(page, slug, opts);
  await context.close();
}

/** Inscrição de quem tem conta: entra antes, para a aprovação criar o vínculo. */
async function registerAsMember(browser: Browser, slug: string, opts: { email: string; password: string; fullName: string; birthYear: number }) {
  const context = await browser.newContext({ storageState: 'e2e/.auth/vercel.json' }); // cookie da proteção da Vercel, quando houver
  const page = await context.newPage();
  await loginByEmail(page, opts.email, opts.password);
  await fillRegistration(page, slug, { fullName: opts.fullName, birthYear: opts.birthYear, sex: 'm' });
  await context.close();
}

async function fillRegistration(page: Page, slug: string, opts: { fullName: string; birthYear: number; sex: 'm' | 'w' }) {
  await page.goto(`/torneios/${slug}/inscricao`);
  await page.getByLabel('Nome completo *').fill(opts.fullName);
  await page.getByLabel('Ano de nascimento').fill(String(opts.birthYear));
  await page.getByLabel('Sexo').selectOption(opts.sex);
  await page.getByRole('button', { name: 'Enviar inscrição' }).click();
  await expect(page.getByText('Inscrição enviada!')).toBeVisible({ timeout: 20_000 });
}
