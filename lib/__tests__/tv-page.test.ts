import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tournament: { id: 'tv-test', name: 'Torneio da TV', city: 'Cidade', state: 'MS', is_public: true, status: 'ongoing' },
  rounds: [] as { id: string; round_number: number; status: string; pairing_groups: { name: string } }[],
  groupCount: 1,
  standings: [] as { tp_id: string; pairing_group_id: string; rank: number; points: number }[],
  standingsError: false,
  rpc: vi.fn(), client: vi.fn(), filters: [] as string[][], error: false,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.client }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'pt-BR' }));
vi.mock('qrcode', () => ({ default: { toString: async () => '<svg></svg>' } }));
vi.mock('@/lib/seo', () => ({ siteUrl: () => 'https://example.test' }));
vi.mock('@/components/tournament/tv-controls', () => ({ TvControls: ({ tournamentId }: { tournamentId: string }) => React.createElement('div', { 'data-tv': tournamentId }) }));
vi.mock('@/components/tournament/tv-pairing-card', () => ({ TvPairingCard: ({ pairing }: { pairing: { pairing_id: string } }) => React.createElement('article', null, pairing.pairing_id) }));
vi.mock('@/components/tournament/tv-display', () => ({ TvDisplay: ({ header, rounds, standings }: { header: React.ReactNode; rounds: React.ReactNode; standings: React.ReactNode }) => React.createElement('main', null, header, rounds, standings) }));
vi.mock('@/components/tournament/tv-standings', () => ({ TvStandings: ({ rows }: { rows: { tp_id: string }[] }) => React.createElement('div', { 'data-standings': true }, rows.map((row) => row.tp_id).join(',')) }));
import TvPage from '../../app/[locale]/torneios/[slug]/painel/page';

describe('public TV page', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    mocks.tournament.status = 'ongoing'; mocks.tournament.is_public = true;
    mocks.rounds = []; mocks.filters = []; mocks.groupCount = 1; mocks.error = false;
    mocks.standings = []; mocks.standingsError = false;
    mocks.rpc.mockReset().mockImplementation(async (name: string) => name === 'get_tournament_standings'
      ? { data: mocks.standings, error: mocks.standingsError ? new Error('unavailable') : null }
      : { data: [{ pairing_id: 'published-game' }], error: null });
    mocks.client.mockReset().mockReturnValue({ rpc: mocks.rpc, from: (table: string) => {
      let statuses: string[] = [];
      const result = () => ({
        data: table === 'tournaments' ? mocks.tournament : table === 'rounds'
          ? mocks.rounds.filter((r) => statuses.includes(r.status)).sort((a, b) => b.round_number - a.round_number)
          : Array.from({ length: mocks.groupCount }, (_, index) => ({ id: `group-${index}`, name: index ? 'Outro grupo' : 'Sub-10' })),
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
  const round = (id: string, n: number, status: string) => ({ id, round_number: n, status, pairing_group_id: 'group-0', pairing_groups: { name: 'Sub-10' } });

  it('uses a cookie-free public client, including when an organizer opens the TV', async () => {
    await render();
    expect(mocks.client.mock.calls[0][2]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(mocks.filters).toEqual([['ongoing', 'finished']]);
  });

  it.each(['draft', 'pending'])('does not select a %s round or call its privileged pairing RPC', async (status) => {
    mocks.rounds = [round('secret', 2, status)];
    expect(await render()).toContain('Aguardando a próxima rodada');
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'get_round_pairings')).toBe(false);
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
    mocks.rpc.mockImplementation(async (name: string) => name === 'get_tournament_standings'
      ? { data: [], error: null }
      : { data: null, error: new Error('unavailable') });
    await expect(render()).rejects.toThrow('Não foi possível carregar as mesas');
  });

  it('loads live standings with the same public client and keeps the selected group only', async () => {
    mocks.groupCount = 2; mocks.rounds = [round('current', 2, 'ongoing')];
    mocks.standings = [
      { tp_id: 'rank-first', pairing_group_id: 'group-0', rank: 1, points: 1.5 },
      { tp_id: 'other-group', pairing_group_id: 'group-1', rank: 1, points: 2 },
      { tp_id: 'rank-second', pairing_group_id: 'group-0', rank: 2, points: 1 },
    ];
    const html = await render();
    expect(html).toContain('rank-first,rank-second');
    expect(html).not.toContain('other-group');
    expect(mocks.rpc).toHaveBeenCalledWith('get_tournament_standings', { p_tournament_id: 'tv-test' });
  });

  it('can show the initial standings before a round is published', async () => {
    mocks.standings = [{ tp_id: 'initial-player', pairing_group_id: 'group-0', rank: 1, points: 0 }];
    expect(await render()).toContain('initial-player');
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'get_round_pairings')).toBe(false);
  });

  it('does not disguise a standings failure as an empty ranking', async () => {
    mocks.standingsError = true;
    await expect(render()).rejects.toThrow('Não foi possível carregar a classificação');
  });
});
