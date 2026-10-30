import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const query = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), limit };
  return { query, from: vi.fn(() => query) };
});
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/utils/chess', () => ({ compareParticipantOrder: () => 0 }));

import { useGroupHasResults as queryOptions } from '../hooks/use-tournament';
type Options = { queryKey: unknown[]; queryFn: () => Promise<boolean>; enabled: boolean; refetchInterval: number };
const options = (group: string | null = 'abs') => queryOptions('tournament', group, true) as unknown as Options;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.select.mockReturnValue(mocks.query);
  mocks.query.eq.mockReturnValue(mocks.query);
  mocks.query.neq.mockReturnValue(mocks.query);
  mocks.query.limit.mockResolvedValue({ data: [{ id: 'zero-point-double-wo' }], error: null });
});

describe('standings recorded-result query', () => {
  it('includes zero-point results but excludes drafts and scopes to the selected group', async () => {
    expect(await options().queryFn()).toBe(true);
    expect(mocks.query.eq).toHaveBeenCalledWith('tournament_id', 'tournament');
    expect(mocks.query.eq).toHaveBeenCalledWith('round.pairing_group_id', 'abs');
    expect(mocks.query.neq).toHaveBeenCalledWith('result', '*');
    expect(mocks.query.neq).toHaveBeenCalledWith('round.status', 'draft');
    expect(mocks.query.limit).toHaveBeenCalledWith(1);
    expect(options().refetchInterval).toBe(30_000);
    expect(options().queryKey).not.toEqual(options('sub8').queryKey);
  });
  it('returns false when the selected group has not recorded any result', async () => {
    mocks.query.limit.mockResolvedValue({ data: [], error: null });
    expect(await options().queryFn()).toBe(false);
  });
  it('does not require a group for a legacy single-group tournament', async () => {
    await options(null).queryFn();
    expect(mocks.query.eq).not.toHaveBeenCalledWith('round.pairing_group_id', expect.anything());
  });
  it('reports read errors instead of treating them as no results', async () => {
    mocks.query.limit.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(options().queryFn()).rejects.toThrow('offline');
  });
});
