import { test, expect, type Page } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { createTournament } from './utils/tournament';
import { adminClient } from './utils/admin';

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

    // --- Classificação: idade (Sub-17) + feminina ---
    // Fica NA TELA DE CRIAÇÃO, antes de "Criar torneio" — as classificações
    // são aplicadas junto com o insert (applyClassificationDraft, ver
    // app/admin/tournaments/new/page.tsx). Não existe mais um "Salvar
    // classificações" separado aqui; a prévia é o feedback.
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sim', exact: true }).click();
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sub-17', exact: true }).click();
    await page.locator('[data-tour="pergunta-feminina"]').getByRole('button', { name: 'Sim', exact: true }).click();
    await expect(page.getByText(/Prévia — 2 classificações/)).toBeVisible();

    await createTournament(page, `E2E Lifecycle ${Date.now()}`);
    const slug = slugFromUrl(page);

    // --- Emparceiramento: todos juntos ---
    // createTournament pousa em /groups?criado=1, que abre um modal de
    // boas-vindas por cima do formulário — fecha antes de clicar em nada.
    await page.getByRole('button', { name: 'Entendi' }).click();
    await page.getByRole('button', { name: 'Não — todos juntos' }).click();
    await page.getByRole('button', { name: 'Salvar emparceiramento' }).click();
    await expect(page.getByText('✓ Salvo')).toBeVisible({ timeout: 15_000 });

    // --- Publicar e abrir inscrições: torneio nasce 'draft'. Sequência
    //     agora é draft → published → registration → registration_closed →
    //     ongoing → finished (migration 038); /register só abre inscrição
    //     com status === 'registration' (app/tournaments/[slug]/register/
    //     page.tsx). Botão nomeado por status (migration 040 cobre o avanço
    //     automático por data; aqui é o caminho manual mesmo) — precisa dos
    //     dois cliques pra sair de draft. Espera o toast entre eles porque
    //     o botão fica disabled durante o save.
    // Confere o RESULTADO de cada transição (o botão da próxima, que só
    // existe naquele status) em vez do "✓ Salvo": aquele toast some em 2,5s
    // e o router.refresh() remonta o cabeçalho, então esperar por ele é
    // corrida — a ação passava e o teste falhava mesmo assim.
    await page.goto(`/admin/tournaments/${slug}/edit`);
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('button', { name: 'Abrir Inscrições' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Abrir Inscrições' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar Inscrições' })).toBeVisible({ timeout: 15_000 });

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
    // A classificação não é mais um <select> inline na linha: mora no modal
    // de "✏️ Editar". O select lista TODAS as opções no DOM, então
    // toContainText pegaria "Feminino" da própria lista de opções do menino —
    // lê a opção realmente marcada.
    await page.goto(`/admin/tournaments/${slug}/players`);

    async function classificacaoDe(nome: string): Promise<string | null | undefined> {
      await page.locator('div.px-4.py-3', { hasText: nome })
        .getByRole('button', { name: /Editar/ }).click();
      const modal = page.getByRole('heading', { name: 'Editar participante' });
      await expect(modal).toBeVisible();
      const valor = await page.getByLabel('Classificação')
        .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent);
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(modal).toBeHidden();
      return valor;
    }

    expect(await classificacaoDe('E2E Menina')).toBe('Sub-17 Feminino');
    expect(await classificacaoDe('E2E Menino')).toBe('Sub-17');

    // --- Ranking inicial + 1ª rodada ---
    // Sem botão manual (migration 058) — "Gerar rodada 1" semeia sozinho se
    // o grupo ainda não tiver seed (generateRoundDraft, lib/pairing/service.ts).
    await page.goto(`/admin/tournaments/${slug}/rounds`);
    await page.getByRole('button', { name: /Gerar rodada 1 de \d+/ }).click();
    // O card da rodada (native-rounds.tsx RoundCard) é um <button> cujo nome
    // acessível inclui "Rodada 1" + o texto do badge de status — getByText
    // solto bate em 3 elementos (aviso de seed, ausências, botão de gerar).
    // Gerar pareamento roda o motor de pareamento no servidor — mais lento
    // que uma mutação comum, o timeout padrão de 5s não é confiável aqui.
    await expect(page.getByRole('button', { name: /^Rodada 1\b/ })).toBeVisible({ timeout: 20_000 });
  });

  test('emparceiramento por idade limpa o grupo Absoluto e "Iniciar Torneio" já deixa a rodada 1 pareada', async ({ page }) => {
    test.setTimeout(240_000);

    await login(page, org);
    await page.goto('/admin/tournaments/new');

    // Duas faixas de idade — dois grupos de emparceiramento, nenhum "Absoluto".
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sim', exact: true }).click();
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sub-11', exact: true }).click();
    await page.locator('[data-tour="pergunta-idade"]').getByRole('button', { name: 'Sub-13', exact: true }).click();

    await createTournament(page, `E2E Idade ${Date.now()}`);
    const slug = slugFromUrl(page);
    await page.getByRole('button', { name: 'Entendi' }).click(); // modal "Torneio criado!"

    await page.getByRole('button', { name: 'Por idade' }).click();
    await page.getByRole('button', { name: 'Salvar emparceiramento' }).click();
    await expect(page.getByText('✓ Salvo')).toBeVisible({ timeout: 15_000 });

    // Regressão: o grupo "Absoluto" nasce junto com o torneio
    // (create-tournament-setup.ts) e ficava órfão ao dividir por faixa,
    // aparecendo vazio como aba na tela de Rodadas.
    const admin = adminClient();
    const { data: tournament } = await admin
      .from('tournaments').select('id').eq('slug', slug).single();
    await expect.poll(async () => {
      const { data } = await admin
        .from('pairing_groups').select('name').eq('tournament_id', tournament!.id);
      return (data ?? []).map((g) => g.name).sort();
    }, { timeout: 15_000 }).toEqual(['Sub-11', 'Sub-13']);

    // Jogadores de teste direto no banco: a inscrição pública é lenta demais
    // pra encher dois grupos, e aqui o que importa é o pareamento existir.
    const { data: grupos } = await admin
      .from('pairing_groups').select('id, name').eq('tournament_id', tournament!.id);
    for (const g of grupos ?? []) {
      await admin.rpc('generate_test_players', {
        p_tournament_id: tournament!.id, p_group_id: g.id, p_count: 4,
      });
    }

    // Iniciar o torneio: além do seed, a rodada 1 já sai pareada em rascunho.
    await page.goto(`/admin/tournaments/${slug}/edit`);
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('button', { name: 'Abrir Inscrições' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Abrir Inscrições' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar Inscrições' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Encerrar Inscrições' }).click();
    await expect(page.getByRole('button', { name: 'Iniciar Torneio' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Iniciar Torneio' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar Torneio' })).toBeVisible({ timeout: 30_000 });

    await page.goto(`/admin/tournaments/${slug}/rounds`);

    // Só as duas faixas aparecem como aba — sem "Absoluto" sobrando.
    await expect(page.getByRole('button', { name: 'Sub-11', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Absoluto', exact: true })).toHaveCount(0);

    // Rodada 1 já existe, em rascunho, e abre EXPANDIDA: o pareamento fica
    // visível sem precisar clicar no card.
    await expect(page.getByRole('button', { name: /^Rodada 1\b/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Publicar rodada' })).toBeVisible();
  });
});
