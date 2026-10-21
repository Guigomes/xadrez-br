import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError } from '@/lib/lite/server';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Backup completo de um torneio da conta (o app restaura e assume a edição neste aparelho). */
export async function GET(request: Request, { params }: Ctx) {
  const user = await getBearerUser(request);
  if (!user) return liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.');
  const { id } = await params;

  const { data } = await createAdminClient()
    .from('lite_tournaments')
    .select('backup, is_public')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!data) return liteError(404, 'NOT_FOUND', 'Torneio não encontrado na sua conta.');
  return NextResponse.json({ backup: data.backup, isPublic: data.is_public });
}

/** Apaga da conta e tira do site (o torneio publicado pelo app é removido junto). */
export async function DELETE(request: Request, { params }: Ctx) {
  const user = await getBearerUser(request);
  if (!user) return liteError(401, 'UNAUTHORIZED', 'Entre de novo com sua conta.');
  const { id } = await params;

  const { error } = await createAdminClient().rpc('lite_delete', { p_id: id, p_owner: user.id });
  if (error) {
    console.error('[lite/delete] lite_delete falhou:', error.message);
    return liteError(500, 'DELETE_FAILED', 'Não foi possível apagar. Tente de novo.');
  }
  return NextResponse.json({ ok: true });
}
