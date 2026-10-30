import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient, type MutationObserverOptions } from '@tanstack/react-query';
import type { RoundPairingRow } from '../../types/database';
import { applyPairingResult, previewRoundResults, resultMutationKey, type EnteredResult, type ResultSubmission } from '../utils/round-results';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), queryClient: null as QueryClient | null }));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQueryClient: () => mocks.queryClient,
  // Run the hook's actual mutation callbacks through a real MutationObserver.
  useMutation: (options: unknown) => options,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('../hooks/use-tournament', () => ({
  tournamentKeys: {
    all: ['tournaments'],
    pairings: (id: string) => ['pairings', id],
    rounds: (id: string) => ['tournaments', id, 'rounds'],
    players: (id: string) => ['tournaments', id, 'players'],
    standings: (id: string) => ['tournaments', id, 'standings'],
  },
}));

// React hooks are mocked above: this captures production mutation options only.
import {
  useSetResult as captureSetResultOptions,
  useRoundTransition as captureRoundTransitionOptions,
} from '../hooks/use-native-rounds';

const row = (id: string, result: EnteredResult = '*'): RoundPairingRow => applyPairingResult({
  pairing_id: id, board_number: 1,
  white_tp_id: `${id}-w`, white_name: 'Vitor Gabriel Felix Vilela', white_rating: null,
  white_rank: null, white_score: 0, white_title: null,
  black_tp_id: `${id}-b`, black_name: 'Dan Vincenzo Tarraf Sebben', black_rating: null,
  black_rank: null, black_score: 0, black_title: null,
  result: '*', white_points: null, black_points: null, is_bye: false, manual_override: false,
}, result);

function deferredRpc() {
  let resolve!: (value: { error: { message: string } | null }) => void;
  const promise = new Promise<{ error: { message: string } | null }>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('immediate round result feedback', () => {
  let qc: QueryClient;
  const key = ['pairings', 'round-1'];
  const confirmed = () => qc.getQueryData<RoundPairingRow[]>(key) ?? [];
  const pending = () => qc.getMutationCache().findAll({
    mutationKey: resultMutationKey('round-1'), exact: true, status: 'pending',
  }).map((mutation) => mutation.state.variables as ResultSubmission);
  const visible = () => previewRoundResults(confirmed(), pending());
  const observer = (roundId = 'round-1') => new MutationObserver(qc,
    captureSetResultOptions('tournament', 'group', roundId) as unknown as MutationObserverOptions<void, Error, ResultSubmission>,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    mocks.queryClient = qc;
    qc.setQueryData(key, [row('a'), row('b')]);
    // A slow notification endpoint must not delay confirmation of the result.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });

  afterEach(() => {
    qc.clear();
    vi.unstubAllGlobals();
  });

  it.each([
    ['1-0', 1, 0], ['0-1', 0, 1], ['1/2-1/2', 0.5, 0.5],
    ['forfeit_white', 0, 1], ['forfeit_black', 1, 0], ['double_forfeit', 0, 0], ['*', null, null],
  ] as const)('previews %s with consistent points', (result, white, black) => {
    const original = row('a', '1-0');
    const updated = applyPairingResult(original, result);
    expect(updated).toMatchObject({ result, white_points: white, black_points: black });
    expect(original.result).toBe('1-0');
    expect(updated.white_name).toBe(original.white_name);
    expect(updated.black_name).toBe(original.black_name);
  });

  it('selects immediately, survives a refetch and keeps the confirmed result without waiting for push', async () => {
    const rpc = deferredRpc();
    mocks.rpc.mockReturnValue(rpc.promise);
    const saving = observer().mutate({ pairingId: 'a', result: '1-0' });
    await vi.waitFor(() => expect(pending()).toHaveLength(1));
    expect(visible()[0].result).toBe('1-0');
    expect(confirmed()[0].result).toBe('*');
    qc.setQueryData(key, [row('a'), row('b')]);
    expect(visible()[0].result).toBe('1-0');
    rpc.resolve({ error: null });
    await saving;
    expect(pending()).toEqual([]);
    expect(visible()[0]).toMatchObject({ result: '1-0', white_points: 1, black_points: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith('set_pairing_result', { p_pairing_id: 'a', p_result: '1-0' });
    expect(fetch).toHaveBeenCalledWith('/api/admin/rounds/round-1/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'result', pairingId: 'a' }),
    });
  });

  it('clearing a result does not send any notification', async () => {
    qc.setQueryData(key, [row('a', '1-0')]);
    mocks.rpc.mockResolvedValue({ error: null });
    await observer().mutate({ pairingId: 'a', result: '*' });
    expect(confirmed()[0].result).toBe('*');
    expect(fetch).not.toHaveBeenCalled();
  });

  const transition = () => new MutationObserver(qc,
    captureRoundTransitionOptions('tournament', 'group') as unknown as MutationObserverOptions<
      void, Error, { action: 'publish' | 'finish' | 'reopen'; roundId: string }
    >,
  );

  it.each([['publish', 'published'], ['finish', 'finished']] as const)(
    '%s sends only its own event after confirmation, without waiting for push', async (action, event) => {
      const rpc = deferredRpc();
      mocks.rpc.mockReturnValue(rpc.promise);
      const saving = transition().mutate({ action, roundId: 'round-1' });
      await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
      expect(fetch).not.toHaveBeenCalled();
      rpc.resolve({ error: null });
      await saving;
      expect(mocks.rpc).toHaveBeenCalledWith(`${action}_round`, { p_round_id: 'round-1' });
      expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/rounds/round-1/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
    },
  );

  it('reopening a round sends no publication or finish event', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await transition().mutate({ action: 'reopen', roundId: 'round-1' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['publish', 'finish'] as const)('a rejected %s sends no event', async (action) => {
    mocks.rpc.mockResolvedValue({ error: { message: 'INVALID_STATE' } });
    await expect(transition().mutate({ action, roundId: 'round-1' })).rejects.toMatchObject({ message: 'INVALID_STATE' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['0-1', '*'] as const)('restores the previous selection after a rejected correction to %s', async (result) => {
    qc.setQueryData(key, [row('a', '1-0'), row('b')]);
    const rpc = deferredRpc();
    mocks.rpc.mockReturnValue(rpc.promise);
    const saving = observer().mutate({ pairingId: 'a', result });
    const rejected = expect(saving).rejects.toMatchObject({ message: 'Rodada encerrada' });
    await vi.waitFor(() => expect(visible()[0].result).toBe(result));
    rpc.resolve({ error: { message: 'Rodada encerrada' } });
    await rejected;
    expect(visible()[0]).toMatchObject({ result: '1-0', white_points: 1, black_points: 0 });
    expect(pending()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rolls back only the failed board while another board saves successfully', async () => {
    const a = deferredRpc(), b = deferredRpc();
    mocks.rpc.mockImplementation((_fn, args) => args.p_pairing_id === 'a' ? a.promise : b.promise);
    const mutation = observer();
    const savingA = mutation.mutate({ pairingId: 'a', result: '1-0' });
    const rejectedA = expect(savingA).rejects.toMatchObject({ message: 'Sem permissão' });
    const savingB = mutation.mutate({ pairingId: 'b', result: '1/2-1/2' });
    await vi.waitFor(() => expect(pending()).toHaveLength(2));
    expect(visible().map((p) => p.result)).toEqual(['1-0', '1/2-1/2']);
    b.resolve({ error: null });
    await savingB;
    expect(visible().map((p) => p.result)).toEqual(['1-0', '1/2-1/2']);
    a.resolve({ error: { message: 'Sem permissão' } });
    await rejectedA;
    expect(visible().map((p) => p.result)).toEqual(['*', '1/2-1/2']);
  });

  it('does not leak pending feedback into another round', async () => {
    const rpc = deferredRpc();
    mocks.rpc.mockReturnValue(rpc.promise);
    const saving = observer('round-2').mutate({ pairingId: 'a', result: '0-1' });
    await vi.waitFor(() => expect(qc.isMutating()).toBe(1));
    expect(pending()).toEqual([]);
    expect(visible()[0].result).toBe('*');
    rpc.resolve({ error: null });
    await saving;
    expect(confirmed()[0].result).toBe('*');
  });
});
