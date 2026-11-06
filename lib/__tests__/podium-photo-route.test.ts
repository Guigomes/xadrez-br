import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StandingRow } from '../../types/database';

const playerId = '11111111-2222-4333-8444-555555555555';
const mocks = vi.hoisted(() => ({
  tournament: { id: 'event', status: 'finished', has_absolute_classification: true, has_female_classification: false } as { id: string; status: string; has_absolute_classification: boolean; has_female_classification: boolean } | null,
  rows: [] as StandingRow[], rpc: vi.fn(), admin: vi.fn(), download: vi.fn(), queryError: false,
  user: { id: 'dev', is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  role: 'admin' as string | null, authError: false, profileError: false,
}));
vi.mock('@/lib/tournament/podium', async () => import('../tournament/podium'));
vi.mock('@/lib/player-photos/config', async () => import('../player-photos/config'));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.tournament, error: mocks.queryError ? new Error('private error') : null }) }) }) }),
  rpc: mocks.rpc,
}) }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mocks.admin,
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: mocks.authError ? new Error('auth failed') : null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.role ? { role: mocks.role } : null, error: mocks.profileError ? new Error('profile failed') : null }) }) }) }),
  }),
}));
import { GET } from '../../app/api/tournaments/[slug]/podium-photo/route';

const row = (patch: Partial<StandingRow> = {}): StandingRow => ({
  rank: 1, player_id: playerId, tp_id: 'tp', full_name: 'Ana', fide_name: null, title: null, points: 4,
  pairing_group_id: 'group', pairing_group_name: 'Absoluto', category_id: 'sub10', category_name: 'Sub-10',
  federation: 'BRA', state: 'MS', rating_std: null, rating_tempo: null, initial_ranking: 1,
  games_played: 5, wins: 3, draws: 2, losses: 0, buchholz: null, buchholz_cut1: null,
  sonneborn_berger: null, progressive: null, performance_rating: null, player_status: 'active', sex: 'w', ...patch,
});
const get = (player = playerId, category = 'group:all') => GET(
  new NextRequest(`https://example.test/api/tournaments/test/podium-photo?${new URLSearchParams({ player, category })}`),
  { params: Promise.resolve({ slug: 'test' }) },
);

describe('Dev-only scoped podium photo read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tournament = { id: 'event', status: 'finished', has_absolute_classification: true, has_female_classification: false };
    mocks.rows = [row()]; mocks.queryError = false;
    mocks.user = { id: 'dev', is_anonymous: false }; mocks.role = 'admin';
    mocks.authError = false; mocks.profileError = false;
    mocks.rpc.mockImplementation(async () => ({ data: mocks.rows, error: null }));
    mocks.download.mockResolvedValue({ data: new Blob(['normalized-photo'], { type: 'image/webp' }), error: null });
    mocks.admin.mockReturnValue({ storage: { from: (bucket: string) => { expect(bucket).toBe('player-photos'); return { download: mocks.download }; } } });
  });
  it('requires a verified, non-anonymous session before reading podium data or storage', async () => {
    mocks.user = null;
    expect((await get()).status).toBe(401);
    mocks.user = { id: 'anonymous', is_anonymous: true };
    expect((await get()).status).toBe(401);
    mocks.user = { id: 'dev', is_anonymous: false }; mocks.authError = true;
    expect((await get()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(['organizer', 'arbiter', 'public_user', null])('denies the %s role even for a real winner', async (role) => {
    mocks.role = role;
    const response = await get();
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('fails closed when the trusted role cannot be verified', async () => {
    mocks.profileError = true;
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('profile failed');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each(['draft', 'published', 'registration', 'registration_closed', 'ongoing', 'cancelled'])('never exposes photos of a %s tournament', async (status) => {
    mocks.tournament!.status = status;
    expect((await get()).status).toBe(404); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not expose a missing or inaccessible event, even with a valid player ID', async () => {
    mocks.tournament = null; expect((await get()).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects arbitrary paths, unknown categories and players outside the three winners', async () => {
    expect((await get('../photo')).status).toBe(404);
    expect((await get(playerId, 'unknown')).status).toBe(404);
    mocks.rows = [row({ rank: 4 })]; expect((await get()).status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('never confuses a winner from a different pairing group with the selected podium', async () => {
    mocks.rows = [row({ player_id: '22222222-2222-4333-8444-555555555555' }), row({ pairing_group_id: 'other', pairing_group_name: 'Outro' })];
    expect((await get()).status).toBe(404); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not serve an absolute podium when that award is disabled and categories exist', async () => {
    mocks.tournament!.has_absolute_classification = false;
    expect((await get()).status).toBe(404); expect(mocks.admin).not.toHaveBeenCalled();
    expect((await get(playerId, 'group:category:sub10')).status).toBe(200);
  });
  it('serves only the authorized image bytes, not a reusable private bucket URL', async () => {
    const response = await get();
    expect(response.status).toBe(200); expect(await response.text()).toBe('normalized-photo');
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(`${playerId}/photo.webp`);
  });
  it('fails closed before privileged access on source errors; missing photos can use the pawn', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('private error') });
    expect((await get()).status).toBe(404); expect(mocks.admin).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: mocks.rows, error: null });
    mocks.download.mockResolvedValue({ data: null, error: new Error('private error') });
    const response = await get(); expect(response.status).toBe(404); expect(await response.text()).not.toContain('private error');
  });
});
