import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getBearerUser, liteError } from '@/lib/lite/server';

/**
 * Aparelho do app Gambito Torneios recebe avisos: guarda o token FCM e, se a pessoa entrou com a
 * conta (Bearer), liga o aparelho ao usuário (avisos de organizador e árbitro). Sem conta também
 * vale — acompanhar torneio e jogador não exige login. Sair da conta manda de novo sem Bearer.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (token.length < 20 || token.length > 4096) return liteError(400, 'BAD_TOKEN', 'Token inválido.');

  const user = request.headers.get('authorization') ? await getBearerUser(request) : null;
  const { error } = await createAdminClient()
    .from('app_push_tokens')
    .upsert({ token, user_id: user?.id ?? null, platform: 'android', updated_at: new Date().toISOString() }, { onConflict: 'token' });
  if (error) {
    console.error('[lite/push/register]', error.message);
    return liteError(500, 'SAVE_FAILED', 'Não foi possível registrar o aparelho.');
  }
  return NextResponse.json({ ok: true, linked: !!user });
}
