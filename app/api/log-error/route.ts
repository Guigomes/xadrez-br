import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log-error';

export const runtime = 'nodejs';

const MAX_LEN = 2000;

/**
 * Ponto de entrada pra erro capturado no navegador — app/error.tsx,
 * app/global-error.tsx, components/error-logger.tsx (window.onerror /
 * unhandledrejection). Sem gate de login: erro pode acontecer em página
 * pública, pra visitante não-logado também.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' && body.message.trim()
    ? body.message.slice(0, MAX_LEN)
    : 'Erro desconhecido';
  const stack = typeof body?.stack === 'string' ? body.stack : null;
  const route = typeof body?.route === 'string' ? body.route.slice(0, 500) : null;
  const context = body?.context && typeof body.context === 'object' ? body.context : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await logError({ source: 'client', message, stack, route, userId: user?.id ?? null, context });

  return NextResponse.json({ ok: true });
}
