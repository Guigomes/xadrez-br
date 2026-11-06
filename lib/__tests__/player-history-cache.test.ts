import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: m.rpc }) }));
import { historyKeys, usePlayerHistory } from '../hooks/use-player-history';

describe('paid player history cache', () => {
  it('separates two viewers of the same player and never shares with logged-out viewers', () => {
    expect(historyKeys.player('player', 'subscriber')).not.toEqual(historyKeys.player('player', 'free-viewer'));
    expect(historyKeys.player('player', 'subscriber')).not.toEqual(historyKeys.player('player'));
  });
  it('is disabled without access and does not retry authorization denial', () => {
    const options = usePlayerHistory('player', false, 'viewer') as unknown as {
      enabled: boolean; queryKey: unknown; staleTime: number; retry: (n: number, error: unknown) => boolean;
    };
    expect(options.enabled).toBe(false); expect(options.queryKey).toEqual(historyKeys.player('player', 'viewer'));
    expect(options.staleTime).toBe(0); expect(options.retry(0, { code: '42501' })).toBe(false);
    expect(options.retry(0, new Error('temporary'))).toBe(true);
  });
  it('propagates the database denial without returning an empty successful history', async () => {
    const options = usePlayerHistory('player', true, 'viewer') as unknown as { queryFn: () => Promise<unknown> };
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'PLAYER_HISTORY_SUBSCRIPTION_REQUIRED' } });
    await expect(options.queryFn()).rejects.toMatchObject({ code: '42501' });
  });
});
