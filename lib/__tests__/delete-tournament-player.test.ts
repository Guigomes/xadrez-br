import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient, type MutationObserverOptions } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  client: null as QueryClient | null,
  from: vi.fn(), remove: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...await original<typeof import('@tanstack/react-query')>(),
  useQueryClient: () => mocks.client,
  useMutation: (options: unknown) => options,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/utils/chess', async () => import('../utils/chess'));
import { useDeleteTournamentPlayer as captureOptions, tournamentKeys } from '../hooks/use-tournament';

describe('removing a participant from one tournament', () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    mocks.client = client;
    const query = { delete: mocks.remove, eq: mocks.eq, select: mocks.select, maybeSingle: mocks.maybeSingle };
    mocks.from.mockReturnValue(query); mocks.remove.mockReturnValue(query);
    mocks.eq.mockReturnValue(query); mocks.select.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'participant' }, error: null });
  });
  afterEach(() => client.clear());
  const observer = (id = 'tournament') => new MutationObserver(client,
    captureOptions(id) as unknown as MutationObserverOptions<string, Error, string>,
  );

  it('deletes only the identified participant in this event, never the global player or games', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await expect(observer().mutate('participant')).resolves.toBe('participant');
    expect(mocks.from.mock.calls).toEqual([['tournament_players']]);
    expect(mocks.eq.mock.calls).toEqual([['id', 'participant'], ['tournament_id', 'tournament']]);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledWith('id'); expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
      tournamentKeys.players('tournament'), tournamentKeys.standings('tournament'), tournamentKeys.lists(),
      ['registrations', 'tournament'], ['requested-byes', 'tournament'],
    ]);
  });
  it('reports linked pairings as a blocked removal, without deleting games or retrying', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: '23503', message: 'foreign key' } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await expect(observer().mutate('participant')).rejects.toThrow('inclusive em rascunho');
    expect(mocks.remove).toHaveBeenCalledOnce(); expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.from.mock.calls).toEqual([['tournament_players']]);
    expect((captureOptions('tournament') as unknown as { retry: boolean }).retry).toBe(false);
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { code: '42501', message: 'permission denied' } },
  ])('does not report success for missing/invisible/forbidden rows: %j', async (result) => {
    mocks.maybeSingle.mockResolvedValue(result);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await expect(observer().mutate('participant')).rejects.toThrow('não tem permissão');
    expect(invalidate).not.toHaveBeenCalled();
  });
  it('shows a recoverable error rather than leaking database internals', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal detail' } });
    await expect(observer().mutate('participant')).rejects.toThrow('Não foi possível excluir');
  });
  it.each([['', 'participant'], ['tournament', '']])('rejects an empty target before making any request', async (tournamentId, tpId) => {
    await expect(observer(tournamentId).mutate(tpId)).rejects.toThrow('Participante inválido');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
