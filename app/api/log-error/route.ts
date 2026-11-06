import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/log-error';

export const runtime = 'nodejs';

const MAX_LEN = 2000;
const MAX_STACK = 8000;
const MAX_CONTEXT = 4000;

/**
 * Ponto de entrada pra erro capturado no navegador — app/error.tsx,
 * app/global-error.tsx, components/error-logger.tsx (window.onerror /
 * unhandledrejection). Sem gate de login: erro pode acontecer em página
 * pública, pra visitante não-logado também. Por ser aberto, tudo tem teto:
 * antes stack e context entravam sem limite em error_logs.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' && body.message.trim()
    ? body.message.slice(0, MAX_LEN)
    : 'Erro desconhecido';
  const stack = typeof body?.stack === 'string' ? body.stack.slice(0, MAX_STACK) : null;
  const route = typeof body?.route === 'string' ? body.route.slice(0, 500) : null;
  const context = boundedContext(body?.context);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await logError({ source: 'client', message, stack, route, userId: user?.id ?? null, context });

  return NextResponse.json({ ok: true });
}

/** Só objeto simples e pequeno; o que passar do teto vira um aviso no lugar. */
function boundedContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { return null; }
  if (serialized.length > MAX_CONTEXT) return { truncated: true, size: serialized.length };
  return value as Record<string, unknown>;
}
