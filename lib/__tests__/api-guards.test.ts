import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  authError: false,
  role: 'admin' as string | null,
  profileError: false,
  tournament: { id: 't1', created_by: 'owner' } as { id: string; created_by: string } | null,
  deleteError: null as { message: string; hint?: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => { throw new Error('admin client must not be used by guards'); },
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: mocks.authError ? new Error('auth') : null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'user_profiles') {
              return { data: mocks.role ? { role: mocks.role } : null, error: mocks.profileError ? new Error('profile') : null };
            }
            return { data: mocks.tournament, error: null };
          },
        }),
      }),
      delete: () => ({ eq: async () => ({ error: mocks.deleteError }) }),
    }),
  }),
}));

import { requireAdmin, requireCronSecret, requireTournamentOwner, requireUser, secretsMatch } from '@/lib/api/guards';
import { DELETE } from '@/app/api/admin/tournaments/[slug]/route';

beforeEach(() => {
  mocks.user = { id: 'u1', is_anonymous: false };
  mocks.authError = false;
  mocks.role = 'admin';
  mocks.profileError = false;
  mocks.tournament = { id: 't1', created_by: 'owner' };
  mocks.deleteError = null;
});

describe('requireUser / requireAdmin', () => {
  it('recusa sem sessão, com erro de auth e conta anônima (401)', async () => {
    mocks.user = null;
    expect((await requireUser()).ok).toBe(false);
    mocks.user = { id: 'u1', is_anonymous: true };
    const anon = await requireUser();
    expect(anon.ok).toBe(false);
    if (!anon.ok) expect(anon.response.status).toBe(401);
    mocks.user = { id: 'u1', is_anonymous: false };
    mocks.authError = true;
    expect((await requireUser()).ok).toBe(false);
  });

  it('admin passa; outro papel recebe 403; falha ao ler perfil vira 503', async () => {
    expect((await requireAdmin()).ok).toBe(true);
    mocks.role = 'public_user';
    const denied = await requireAdmin();
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);
    mocks.profileError = true;
    const broken = await requireAdmin();
    if (!broken.ok) expect(broken.response.status).toBe(503);
  });
});

describe('requireTournamentOwner', () => {
  it('dono passa sem consultar papel; admin passa; terceiro recebe 403; slug inexistente 404', async () => {
    mocks.user = { id: 'owner', is_anonymous: false };
    mocks.role = null;
    expect((await requireTournamentOwner('x')).ok).toBe(true);

    mocks.user = { id: 'other', is_anonymous: false };
    mocks.role = 'admin';
    expect((await requireTournamentOwner('x')).ok).toBe(true);

    mocks.role = 'public_user';
    const denied = await requireTournamentOwner('x');
    if (!denied.ok) expect(denied.response.status).toBe(403);
    else throw new Error('should deny');

    mocks.tournament = null;
    const missing = await requireTournamentOwner('x');
    if (!missing.ok) expect(missing.response.status).toBe(404);
    else throw new Error('should be 404');
  });
});

describe('segredo do robô', () => {
  const original = process.env.CRON_PUSH_SECRET;
  afterEach(() => { process.env.CRON_PUSH_SECRET = original; });
  const req = (secret?: string) => new NextRequest('https://example.test/api/internal/x', {
    method: 'POST', headers: secret === undefined ? {} : { 'x-cron-secret': secret },
  });

  it('compara em tempo constante e trata tamanho diferente/ausente', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
    expect(secretsMatch('abd', 'abc')).toBe(false);
    expect(secretsMatch('ab', 'abc')).toBe(false);
    expect(secretsMatch(null, 'abc')).toBe(false);
  });

  it('500 sem segredo configurado, 401 com segredo errado, null quando bate', () => {
    delete process.env.CRON_PUSH_SECRET;
    expect(requireCronSecret(req('x'))?.status).toBe(500);
    process.env.CRON_PUSH_SECRET = 's3cr3t';
    expect(requireCronSecret(req())?.status).toBe(401);
    expect(requireCronSecret(req('errado'))?.status).toBe(401);
    expect(requireCronSecret(req('s3cr3t'))).toBeNull();
  });
});

describe('DELETE /api/admin/tournaments/[slug]', () => {
  const call = () => DELETE(new NextRequest('https://example.test/api/admin/tournaments/x', { method: 'DELETE' }),
    { params: Promise.resolve({ slug: 'x' }) });

  it('exclui quando o dono pede', async () => {
    mocks.user = { id: 'owner', is_anonymous: false };
    const res = await call();
    expect(res.status).toBe(200);
  });

  it('trava financeira do banco vira 409 com a mensagem pronta', async () => {
    mocks.user = { id: 'owner', is_anonymous: false };
    mocks.deleteError = { message: 'Este torneio tem inscrição com cobrança ou pagamento e não pode ser excluído.', hint: 'FINANCIAL_HISTORY' };
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: mocks.deleteError.message, code: 'FINANCIAL_HISTORY' });
  });

  it('erro inesperado não vaza a mensagem do banco', async () => {
    mocks.user = { id: 'owner', is_anonymous: false };
    mocks.deleteError = { message: 'relation "x" violates internal detail' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call();
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain('relation');
  });

  it('terceiro sem papel de admin recebe 403', async () => {
    mocks.user = { id: 'other', is_anonymous: false };
    mocks.role = 'public_user';
    expect((await call()).status).toBe(403);
  });
});
