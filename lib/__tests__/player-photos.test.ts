import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_PHOTO_MAX_BYTES, playerPhotoFileError, playerPhotoPath } from '../player-photos/config';

const mocks = vi.hoisted(() => ({
  user: { id: 'dev' } as { id: string } | null,
  role: 'admin', playerExists: true, profileError: false,
  admin: vi.fn(), upload: vi.fn(), list: vi.fn(), prepare: vi.fn(),
}));
vi.mock('@/lib/player-photos/config', async () => import('../player-photos/config'));
vi.mock('@/lib/player-photos/image', () => ({ preparePlayerPhoto: mocks.prepare }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: mocks.role }, error: mocks.profileError ? new Error('private') : null }) }) }) }),
  }),
  createAdminClient: mocks.admin,
}));
import { GET, PUT } from '../../app/api/admin/players/[playerId]/photo/route';

const id = '11111111-2222-4333-8444-555555555555';
const context = (playerId = id) => ({ params: Promise.resolve({ playerId }) });
const request = (photo?: File, headers: Record<string, string> = {}) => {
  const form = new FormData(); if (photo) form.set('photo', photo);
  return new NextRequest(`https://example.test/api/admin/players/${id}/photo`, { method: 'PUT', body: form, headers });
};
const image = () => new File(['image'], 'photo.jpg', { type: 'image/jpeg' });

describe('player photo input', () => {
  it('uses an exact global UUID, never a player name, external URL or arbitrary path', () => {
    expect(playerPhotoPath(id)).toBe(`${id}/photo.webp`);
    for (const input of ['Miguel Oliveira', '../other', `${id}/extra`, 'https://example.test/photo.jpg']) expect(playerPhotoPath(input)).toBeNull();
  });
  it('restricts image types and input size, including empty files', () => {
    expect(playerPhotoFileError(image())).toBeNull();
    expect(playerPhotoFileError({ size: 0, type: 'image/png' })).toContain('vazia');
    expect(playerPhotoFileError({ size: PLAYER_PHOTO_MAX_BYTES + 1, type: 'image/jpeg' })).toContain('3 MB');
    expect(playerPhotoFileError({ size: 30, type: 'image/svg+xml' })).toContain('JPG');
    expect(playerPhotoFileError({ size: 30, type: 'image/gif' })).toContain('JPG');
  });
});

describe('Dev-only photo API', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user = { id: 'dev' }; mocks.role = 'admin'; mocks.playerExists = true; mocks.profileError = false;
    mocks.upload.mockResolvedValue({ data: {}, error: null }); mocks.list.mockResolvedValue({ data: [], error: null });
    mocks.prepare.mockResolvedValue(Buffer.from('normalized-webp'));
    mocks.admin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.playerExists ? { id } : null, error: null }) }) }) }),
      storage: { from: (bucket: string) => { expect(bucket).toBe('player-photos'); return { upload: mocks.upload, list: mocks.list }; } },
    });
  });
  it('denies anonymous callers before constructing a privileged client or reading a file', async () => {
    mocks.user = null;
    expect((await PUT(request(image()), context())).status).toBe(401);
    expect((await GET(request(), context())).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(['organizer', 'arbiter', 'public_user'])('denies a signed-in %s for both status and upload', async (role) => {
    mocks.role = role;
    expect((await PUT(request(image()), context())).status).toBe(403);
    expect((await GET(request(), context())).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('fails closed when the trusted profile cannot be read', async () => {
    mocks.profileError = true;
    expect((await PUT(request(image()), context())).status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('does not accept arbitrary player paths or nonexistent players', async () => {
    expect((await PUT(request(image()), context('../other'))).status).toBe(400);
    mocks.playerExists = false;
    expect((await PUT(request(image()), context())).status).toBe(404);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('reports only association metadata, with no public/signed URL or image content', async () => {
    mocks.list.mockResolvedValue({ data: [{ name: 'photo.webp', updated_at: '2026-10-31T14:00:00Z' }], error: null });
    const response = await GET(request(), context());
    expect(await response.json()).toEqual({ hasPhoto: true, updatedAt: '2026-10-31T14:00:00Z' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.list).toHaveBeenCalledWith(id, { limit: 10, search: 'photo.webp' });
  });
  it('distinguishes a missing photo from a storage failure', async () => {
    expect(await (await GET(request(), context())).json()).toEqual({ hasPhoto: false, updatedAt: null });
    mocks.list.mockResolvedValue({ data: null, error: new Error('internal secret') });
    const failed = await GET(request(), context());
    expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('internal secret');
  });
  it('rejects cross-origin, missing, oversized or invalid photos before upload', async () => {
    expect((await PUT(request(image(), { origin: 'https://evil.test' }), context())).status).toBe(403);
    expect((await PUT(request(), context())).status).toBe(400);
    expect((await PUT(request(image(), { 'content-length': String(PLAYER_PHOTO_MAX_BYTES + 100_000) }), context())).status).toBe(413);
    expect((await PUT(request(new File(['svg'], 'image.svg', { type: 'image/svg+xml' })), context())).status).toBe(400);
    mocks.prepare.mockRejectedValue(new Error('decode error'));
    expect((await PUT(request(image()), context())).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('replaces only the selected player photo after successful validation', async () => {
    const response = await PUT(request(image()), context());
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ hasPhoto: true });
    expect(mocks.upload).toHaveBeenCalledWith(`${id}/photo.webp`, Buffer.from('normalized-webp'), { contentType: 'image/webp', cacheControl: '0', upsert: true });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('does not announce success or expose internal errors if storage fails', async () => {
    mocks.upload.mockResolvedValue({ data: null, error: new Error('internal secret') });
    const response = await PUT(request(image()), context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('internal secret');
  });
});

describe('private photo storage contract', () => {
  it('leaves public player fields unchanged and blocks direct client access to the private bucket', () => {
    const migration = readFileSync(new URL('../../supabase/migrations/20261031144822_player_photos_private_storage.sql', import.meta.url), 'utf8');
    expect(migration).toContain("'player-photos', 'player-photos', false");
    expect(migration).toContain('as restrictive for all to anon, authenticated');
    expect(migration).toContain("using (bucket_id <> 'player-photos')");
    expect(migration).toContain("with check (bucket_id <> 'player-photos')");
    expect(migration).not.toMatch(/alter\s+table\s+(public\.)?players/i);
  });
  it('does not render an image, preview or download URL in the Dev screen', () => {
    const page = readFileSync(new URL('../../app/[locale]/admin/dev/fotos-jogadores/page.tsx', import.meta.url), 'utf8');
    expect(page).not.toMatch(/<img|<Image|createObjectURL|getPublicUrl|createSignedUrl/);
    expect(page).toContain("profile?.role !== 'admin'");
  });
});
