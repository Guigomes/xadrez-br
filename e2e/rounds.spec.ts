import { test, expect, type Page } from '@playwright/test';
import { createTestOrganizer, deleteTestOrganizer, type TestOrganizer } from './utils/test-user';
import { createTournament } from './utils/tournament';
import { dismissTour, loginByEmail } from './utils/auth';
import { adminClient } from './utils/admin';

/**
 * Rodadas pela tela: gerar o pareamento, publicar, lançar resultados no painel
 * do árbitro, encerrar a rodada — duas vezes — até o torneio encerrar sozinho
 * e a classificação final aparecer.
 *
 * Os 4 participantes entram direto no banco (inscrição e aprovação têm teste
 * próprio em registration.spec.ts). O pareamento vem do motor (bbpPairings);
 * o teste não fixa quem joga contra quem, só confere a consistência: 2 mesas
 * por rodada, ninguém repete adversário, e os pontos da classificação batem
 * com os resultados lançados.
 */
test.describe('rodadas, resultados e classificação', () => {
  let org: TestOrganizer;
  const run = Date.now();
  const names = ['A', 'B', 'C', 'D'].map((x) => `E2E Rodada ${x} ${run}`);

  test.afterAll(async () => {
    if (org) await deleteTestOrganizer(org.id);
    await adminClient().from('players').delete().in('full_name', names);
  });

  test('2 rodadas com 4 jogadores, do pareamento à classificação final', async ({ page }) => {
    test.setTimeout(420_000);
    org = await createTestOrganizer();
    await dismissTour(page);
    await loginByEmail(page, org.email, org.password);

    await page.goto('/admin/torneios/novo');
    await createTournament(page, `E2E Rodadas ${run}`, { rounds: 2 });
    const slug = page.url().match(/\/admin\/torneios\/([^/]+)\//)![1];
    await page.getByRole('button', { name: 'Entendi' }).click();

    // --- 4 participantes no grupo Absoluto, com rating para o ranking inicial ---
    const admin = adminClient();
    const { data: t } = await admin.from('tournaments').select('id').eq('slug', slug).single();
    const { data: group } = await admin.from('pairing_groups').select('id').eq('tournament_id', t!.id).single();
    const { data: players, error: pe } = await admin.from('players')
      .insert(names.map((full_name, i) => ({ full_name, federation: 'BRA', rating_std: 1600 - i * 100, rating_rpd: 1600 - i * 100, birth_year: 2012 })))
      .select('id, full_name');
    if (pe) throw pe;
    const { error: te } = await admin.from('tournament_players')
      .insert(players!.map((p) => ({ tournament_id: t!.id, player_id: p.id, pairing_group_id: group!.id })));
    if (te) throw te;

    // --- Rascunho → publicado → inscrições → encerradas → em andamento ---
    await page.goto(`/admin/torneios/${slug}/editar`);
    for (const [click, next] of [
      ['Publicar', 'Abrir Inscrições'],
      ['Abrir Inscrições', 'Encerrar Inscrições'],
      ['Encerrar Inscrições', 'Iniciar Torneio'],
      ['Iniciar Torneio', 'Encerrar Torneio'],
    ]) {
      await page.getByRole('button', { name: click, exact: true }).click();
      await expect(page.getByRole('button', { name: next, exact: true })).toBeVisible({ timeout: 20_000 });
    }

    // Rodada 1: brancas vencem na mesa 1, empate na mesa 2.
    await playRound(page, slug, t!.id, 1, ['Brancas', 'Empate']);
    // Rodada 2 (última): pretas vencem na mesa 1, brancas na mesa 2. Encerrar a
    // última rodada encerra o torneio e leva à classificação.
    await playRound(page, slug, t!.id, 2, ['Pretas', 'Brancas']);
    await expect.poll(async () => (await admin.from('tournaments').select('status').eq('id', t!.id).single()).data?.status,
      { timeout: 60_000 }).toBe('finished');
    await expect(page).toHaveURL(new RegExp(`/admin/torneios/${slug}/classificacao`), { timeout: 30_000 });

    // --- Banco: torneio encerrado, rodadas encerradas, pareamentos coerentes ---
    const { data: done } = await admin.from('tournaments').select('status').eq('id', t!.id).single();
    expect(done!.status).toBe('finished');
    const { data: rounds } = await admin.from('rounds').select('id, round_number, status').eq('tournament_id', t!.id).order('round_number');
    expect(rounds!.map((r) => [r.round_number, r.status])).toEqual([[1, 'finished'], [2, 'finished']]);

    const { data: pairings } = await admin.from('pairings')
      .select('round_id, board_number, result, white:tournament_players!pairings_white_tp_id_fkey(player_id), black:tournament_players!pairings_black_tp_id_fkey(player_id)')
      .eq('tournament_id', t!.id);
    expect(pairings).toHaveLength(4);
    const byRound = (n: number) => pairings!.filter((p) => p.round_id === rounds![n - 1].id).sort((a, b) => a.board_number! - b.board_number!);
    expect(byRound(1).map((p) => p.result)).toEqual(['1-0', '1/2-1/2']);
    expect(byRound(2).map((p) => p.result)).toEqual(['0-1', '1-0']);
    const pid = (side: unknown) => (side as { player_id: string }).player_id;
    const pairsSeen = pairings!.map((p) => [pid(p.white), pid(p.black)].sort().join('|'));
    expect(new Set(pairsSeen).size, 'ninguém enfrenta o mesmo adversário duas vezes').toBe(4);

    // Pontos esperados a partir dos resultados lançados.
    const expected = new Map<string, number>();
    for (const p of pairings!) {
      const [w, b] = [pid(p.white), pid(p.black)];
      const [sw, sb] = p.result === '1-0' ? [1, 0] : p.result === '0-1' ? [0, 1] : [0.5, 0.5];
      expected.set(w, (expected.get(w) ?? 0) + sw);
      expected.set(b, (expected.get(b) ?? 0) + sb);
    }
    const { data: standings } = await admin.from('standings')
      .select('points, rank, tournament_players(player_id)').eq('tournament_id', t!.id).order('rank');
    expect(standings).toHaveLength(4);
    for (const s of standings!) {
      expect(Number(s.points)).toBe(expected.get(pid(s.tournament_players)));
    }
    expect(standings!.reduce((sum, s) => sum + Number(s.points), 0)).toBe(4);

    // --- Classificação pública: o líder aparece primeiro ---
    const leaderName = players!.find((p) => p.id === pid(standings![0].tournament_players))!.full_name;
    await page.goto(`/torneios/${slug}/classificacao`);
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toContainText(leaderName, { timeout: 30_000 });
  });
});

/** Gera, publica, lança os resultados (na ordem das mesas) e encerra uma rodada. */
async function playRound(page: Page, slug: string, tournamentId: string, roundNumber: number, results: ('Brancas' | 'Empate' | 'Pretas')[]) {
  const round = async () => (await adminClient().from('rounds').select('id, status')
    .eq('tournament_id', tournamentId).eq('round_number', roundNumber).maybeSingle()).data;

  await page.goto(`/admin/torneios/${slug}/rodadas`);
  await page.getByRole('button', { name: new RegExp(`Gerar rodada ${roundNumber} de 2`) }).click();
  await expect.poll(async () => (await round())?.status, { timeout: 30_000 }).toBe('draft');
  const publish = page.getByRole('button', { name: 'Publicar rodada' });
  await expect(publish).toBeEnabled({ timeout: 30_000 });
  await publish.click();
  // A lista recarrega e reabre os cards depois de publicar; em vez de caçar o
  // link do painel nela, espera o banco confirmar e abre o painel pelo endereço.
  await expect.poll(async () => (await round())?.status, { timeout: 30_000 }).toBe('ongoing');
  await page.goto(`/admin/torneios/${slug}/rodadas/${(await round())!.id}/resultados`);

  for (const [i, label] of results.entries()) {
    const board = page.getByRole('group', { name: `Resultado da mesa ${i + 1}` });
    await board.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await expect(board.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-pressed', 'true');
  }
  const finish = page.getByRole('button', { name: 'Encerrar rodada' });
  await expect(finish).toBeEnabled({ timeout: 30_000 });
  await finish.click();
  await page.waitForURL((url) => !/\/resultados$/.test(url.pathname), { timeout: 60_000 });
}
