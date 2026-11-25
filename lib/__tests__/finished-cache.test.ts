import { beforeEach, describe, expect, it, vi } from 'vitest';

const ID = '11111111-2222-4333-8444-555555555555';

const mocks = vi.hoisted(() => ({
  cacheCalls: [] as { keyParts: string[]; options: { revalidate?: number; tags?: string[] } }[],
  rpc: vi.fn(),
  pages: [] as { id: string; result: string; is_bye: boolean }[][],
  slug: 'torneio' as string | null,
  status: 'finished',
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options: { revalidate?: number; tags?: string[] }) => {
    mocks.cacheCalls.push({ keyParts, options });
    return fn;
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (name: string, args: unknown) => {
      if (name === 'get_tournament_page_data') {
        return { maybeSingle: async () => ({ data: { effective_status: mocks.status }, error: null }) };
      }
      return mocks.rpc(name, args);
    },
    from: (table: string) => {
      if (table === 'tournaments') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.slug ? { slug: mocks.slug } : null }) }) }) };
      }
      let page = 0;
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain,
        range: async (from: number) => { page = from / 1000; return { data: mocks.pages[page] ?? [], error: null }; },
      };
      return chain;
    },
  }),
}));

import {
  FINISHED_CACHE_SECONDS, getFinishedPairingResults, getFinishedStandings, isTournamentFinished, tournamentCacheTag,
} from '../data/finished-cache';
import { GET } from '../../app/api/public/tournaments/[id]/standings/route';

describe('cache de torneio encerrado', () => {
  beforeEach(() => {
    mocks.cacheCalls = [];
    mocks.rpc.mockReset();
    mocks.pages = [];
    mocks.slug = 'torneio';
    mocks.status = 'finished';
  });

  it('guarda a classificação por torneio, com tag e validade', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ tp_id: 'a' }], error: null });
    expect(await getFinishedStandings(ID)).toEqual([{ tp_id: 'a' }]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_tournament_standings', { p_tournament_id: ID });
    expect(mocks.cacheCalls[0].keyParts).toEqual(['finished-tournament', 'standings', ID]);
    expect(mocks.cacheCalls[0].options).toEqual({ revalidate: FINISHED_CACHE_SECONDS, tags: [tournamentCacheTag(ID)] });
  });

  it('erro do banco devolve null (não entra no cache) e id inválido nem consulta', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'egress' } });
    expect(await getFinishedStandings(ID)).toBeNull();
    expect(await getFinishedStandings('nao-e-uuid')).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('junta todas as páginas de resultados', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, result: '1-0', is_bye: false }));
    mocks.pages = [full, [{ id: 'x', result: '1/2-1/2', is_bye: false }]];
    const results = await getFinishedPairingResults(ID);
    expect(results).toHaveLength(1001);
    expect(results?.[1000]).toEqual({ result: '1/2-1/2', is_bye: false });
  });

  it('usa o status exibido do torneio', async () => {
    expect(await isTournamentFinished(ID)).toBe(true);
    mocks.status = 'ongoing';
    expect(await isTournamentFinished(ID)).toBe(false);
    mocks.slug = null;
    expect(await isTournamentFinished(ID)).toBe(false);
  });

  it('rota: encerrado vai para a CDN; em andamento responde 404 sem cache', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ tp_id: 'a' }], error: null });
    const ok = await GET(new Request('http://x'), { params: Promise.resolve({ id: ID }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toContain(`s-maxage=${FINISHED_CACHE_SECONDS}`);
    expect(await ok.json()).toEqual([{ tp_id: 'a' }]);

    mocks.status = 'ongoing';
    const live = await GET(new Request('http://x'), { params: Promise.resolve({ id: ID }) });
    expect(live.status).toBe(404);
    expect(live.headers.get('Cache-Control')).toBe('no-store');
  });
});
