import { createAdminClient } from '@/lib/supabase/server';

export interface LogErrorInput {
  source: 'client' | 'server' | 'api';
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  context?: Record<string, unknown> | null;
}

/**
 * Grava em error_logs (migration 053) — chamado direto de catch de rota de
 * API (server), ou via app/api/log-error/route.ts (client: app/error.tsx,
 * app/global-error.tsx, components/error-logger.tsx).
 *
 * Nunca lança — logar o erro não pode virar um segundo erro que derruba o
 * fluxo que já estava quebrado. Falha aqui só vai pro console mesmo.
 */
export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('error_logs').insert({
      source: input.source,
      message: input.message.slice(0, 2000),
      stack: input.stack?.slice(0, 8000) ?? null,
      route: input.route ?? null,
      method: input.method ?? null,
      status_code: input.statusCode ?? null,
      user_id: input.userId ?? null,
      context: input.context ?? null,
    });
  } catch (err) {
    console.error('[log-error] falhou ao gravar em error_logs:', err);
  }
}
