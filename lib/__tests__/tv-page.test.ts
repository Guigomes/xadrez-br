import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tournament: { id: 'tv-test', name: 'Torneio da TV', city: 'Cidade', state: 'MS', is_public: true, status: 'ongoing' },
  rounds: [] as { id: string; round_number: number; status: string; pairing_groups: { name: string } }[],
  groupCount: 1,
  rpc: vi.fn(), client: vi.fn(), filters: [] as string[][], error: false,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR' }));
vi.mock('qrcode', () => ({ default: { toString: async () => '<svg></svg>' } }));
vi.mock('@/lib/seo', () => ({ siteUrl: () => 'https://example.test' }));
vi.mock('@/components/tournament/tv-controls', () => ({ TvControls: ({ tournamentId }: { tournamentId: string }) => React.createElement('div', { 'data-tv': tournamentId }) }));
vi.mock('@/components/tournament/tv-pairing-card', () => ({ TvPairingCard: ({ pairing }: { pairing: { pairing_id: string } }) => React.createElement('article', null, pairing.pairing_id) }));
import TvPage from '../../app/[locale]/torneios/[slug]/painel/page';

describe('public TV page', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    mocks.tournament.status = 'ongoing'; mocks.tournament.is_public = true;
    mocks.rounds = []; mocks.filters = []; mocks.groupCount = 1; mocks.error = false;
    mocks.rpc.mockReset().mockResolvedValue({ data: [{ pairing_id: 'published-game' }], error: null });
    mocks.client.mockReset().mockReturnValue({ rpc: mocks.rpc, from: (table: string) => {
      let statuses: string[] = [];
      const result = () => ({
        data: table === 'tournaments' ? mocks.tournament : table === 'rounds'
          ? mocks.rounds.filter((r) => statuses.includes(r.status)).sort((a, b) => b.round_number - a.round_number) : [],
        count: mocks.groupCount, error: mocks.error ? new Error('database unavailable') : null,
      });
      const query = {
        select: () => query, eq: () => query, order: () => query,
        in: (_column: string, values: string[]) => { statuses = values; mocks.filters.push(values); return query; },
        maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    } });
  });
  afterEach(() => vi.unstubAllGlobals());
  const render = async () => renderToStaticMarkup(await TvPage({ params: Promise.resolve({ slug: 'tv-test' }) }));
  const round = (id: string, n: number, status: string) => ({ id, round_number: n, status, pairing_groups: { name: 'Sub-10' } });

  it('uses a cookie-free public client, including when an organizer opens the TV', async () => {
    await render();
    expect(mocks.client.mock.calls[0][2]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(mocks.filters).toEqual([['ongoing', 'finished']]);
  });

  it.each(['draft', 'pending'])('does not select a %s round or call its privileged pairing RPC', async (status) => {
    mocks.rounds = [round('secret', 2, status)];
    expect(await render()).toContain('Aguardando a próxima rodada');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('prioritizes ongoing pairings over an already finished category', async () => {
    mocks.rounds = [round('done', 3, 'finished'), round('current', 2, 'ongoing')];
    const html = await render();
    expect(html).toContain('published-game');
    expect(html).toContain('data-tv="tv-test"');
    expect(mocks.rpc).toHaveBeenCalledWith('get_round_pairings', { p_round_id: 'current' });
  });

  it('retains the latest finished results between rounds without exposing the next draft', async () => {
    mocks.rounds = [round('draft', 3, 'draft'), round('last', 2, 'finished'), round('old', 1, 'finished')];
    const html = await render();
    expect(html).toContain('Finalizada · aguardando a próxima rodada');
    expect(mocks.rpc).toHaveBeenCalledWith('get_round_pairings', { p_round_id: 'last' });
  });

  it('labels the final round as a finished tournament, not waiting for another round', async () => {
    mocks.tournament.status = 'finished'; mocks.rounds = [round('last', 6, 'finished')];
    const html = await render();
    expect(html).toContain('Torneio encerrado');
    expect(html).not.toContain('aguardando a próxima rodada');
  });

  it('shows the group name only when there are multiple groups', async () => {
    mocks.rounds = [round('current', 1, 'ongoing')]; mocks.groupCount = 2;
    expect(await render()).toContain('Sub-10');
    mocks.groupCount = 1;
    expect(await render()).not.toContain('Sub-10');
  });

  it('rejects draft tournaments regardless of the public-list flag', async () => {
    mocks.tournament.status = 'draft'; await expect(render()).rejects.toThrow('NOT_FOUND');
    mocks.tournament.is_public = false;
    await expect(render()).rejects.toThrow('NOT_FOUND');
  });

  it('opens an unlisted tournament by direct link without login and keeps the QR and published games', async () => {
    mocks.tournament.is_public = false;
    mocks.rounds = [round('draft', 4, 'draft'), round('current', 3, 'ongoing')];
    const html = await render();
    expect(html).toContain('Torneio da TV');
    expect(html).toContain('published-game');
    expect(html).toContain('acompanhe pelo celular');
    expect(mocks.filters).toEqual([['ongoing', 'finished']]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_round_pairings', { p_round_id: 'current' });
  });

  it('does not present a query failure as an empty waiting room', async () => {
    mocks.error = true; await expect(render()).rejects.toThrow('Não foi possível');
    mocks.error = false; mocks.rounds = [round('current', 1, 'ongoing')];
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('unavailable') });
    await expect(render()).rejects.toThrow('Não foi possível carregar as mesas');
  });
});
