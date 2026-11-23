import { test, expect } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { createTournament, futureDate } from './utils/tournament';
import { dismissTour, loginByEmail } from './utils/auth';
import { adminClient } from './utils/admin';

/**
 * Criação de torneio pela tela (/admin/torneios/novo).
 *
 * A conta organizadora nasce pela Admin API (createTestOrganizer) — o cadastro
 * pela tela tem teste próprio em signup.spec.ts. Confere que o torneio sai
 * como rascunho nativo, com os dados do formulário, que o organizador cai no
 * Emparceiramento e que o torneio aparece no painel dele.
 */
test.describe('criação de torneio', () => {
  let org: TestOrganizer;

  test.beforeEach(async ({ page }) => {
    org = await createTestOrganizer();
    await dismissTour(page);
  });

  test.afterEach(async () => {
    await deleteTestOrganizer(org.id);
  });

  test('organizador cria um torneio e ele nasce como rascunho com os dados do formulário', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `E2E Criação ${Date.now()}`;
    const startDate = futureDate(30);

    await loginByEmail(page, org.email, org.password);
    await page.goto('/admin/torneios/novo');
    await createTournament(page, name, { timeControl: 'G/15+10', startDate });

    const slug = page.url().match(/\/admin\/torneios\/([^/]+)\//)?.[1];
    expect(slug, 'slug na URL do emparceiramento').toBeTruthy();
    // ?criado=1 abre o aviso de boas-vindas no Emparceiramento.
    await expect(page.getByRole('button', { name: 'Entendi' })).toBeVisible();

    const { data: t } = await adminClient().from('tournaments')
      .select('name, city, state, start_date, time_control, time_control_kind, mode, status, created_by, is_public')
      .eq('slug', slug!).single();
    expect(t).toMatchObject({
      name, city: 'São Paulo', state: 'SP', start_date: startDate,
      time_control: 'G/15+10', time_control_kind: 'rapid',
      mode: 'native', status: 'draft', created_by: org.id,
    });

    // Todo torneio nativo nasce com o grupo de emparceiramento "Absoluto".
    const { data: groups } = await adminClient().from('pairing_groups').select('name').eq('tournament_id', (await adminClient().from('tournaments').select('id').eq('slug', slug!).single()).data!.id);
    expect(groups?.map((g) => g.name)).toContain('Absoluto');

    await page.getByRole('button', { name: 'Entendi' }).click();
    await page.goto('/admin');
    await expect(page.getByText(name)).toBeVisible({ timeout: 30_000 });
  });

  test('não cria torneio sem os campos obrigatórios', async ({ page }) => {
    await loginByEmail(page, org.email, org.password);
    await page.goto('/admin/torneios/novo');
    await page.getByRole('button', { name: 'Criar torneio' }).click();
    await expect(page).toHaveURL(/\/admin\/torneios\/novo/);
    const { count } = await adminClient().from('tournaments').select('id', { count: 'exact', head: true }).eq('created_by', org.id);
    expect(count).toBe(0);
  });
});
