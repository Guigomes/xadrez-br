import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Checagens de acesso das rotas de API, num lugar só.
 *
 * Antes, cada rota repetia getUser() + SELECT em user_profiles à mão, com
 * mensagens e códigos diferentes; esquecer a checagem numa rota nova era um
 * erro silencioso. Uso:
 *
 *   const gate = await requireAdmin();
 *   if (!gate.ok) return gate.response;
 *   gate.user / gate.supabase
 *
 * O gate da UI (useProfile etc.) é só cosmético; a barreira é esta.
 */

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export type GuardResult<T> = ({ ok: true } & T) | { ok: false; response: NextResponse };

export const UNAUTHENTICATED_MESSAGE = 'Não autenticado.';
export const ADMIN_ONLY_MESSAGE = 'Restrito a administradores.';

function deny(status: number, error: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/** Sessão válida (conta anônima não conta). */
export async function requireUser(): Promise<GuardResult<{ user: User; supabase: SessionClient }>> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.is_anonymous) return deny(401, UNAUTHENTICATED_MESSAGE);
  return { ok: true, user, supabase };
}

/** Sessão válida + `user_profiles.role = 'admin'` (o "Dev"). */
export async function requireAdmin(): Promise<GuardResult<{ user: User; supabase: SessionClient }>> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const { data: profile, error } = await gate.supabase
    .from('user_profiles').select('role').eq('id', gate.user.id).maybeSingle();
  if (error) return deny(503, 'Não foi possível verificar a permissão. Tente de novo.');
  if (profile?.role !== 'admin') return deny(403, ADMIN_ONLY_MESSAGE);
  return gate;
}

/**
 * Dono do torneio ou admin — o mesmo critério do RLS de `tournaments`.
 * 404 quando o slug não existe ou não é visível para a sessão.
 */
export async function requireTournamentOwner(slug: string): Promise<GuardResult<{
  user: User; supabase: SessionClient; tournament: { id: string; created_by: string };
}>> {
  const gate = await requireUser();
  if (!gate.ok) return gate;
  const { data: tournament } = await gate.supabase
    .from('tournaments').select('id, created_by').eq('slug', slug).maybeSingle();
  if (!tournament) return deny(404, 'Torneio não encontrado.');
  if (tournament.created_by !== gate.user.id) {
    const { data: profile } = await gate.supabase
      .from('user_profiles').select('role').eq('id', gate.user.id).maybeSingle();
    if (profile?.role !== 'admin') return deny(403, 'Sem permissão.');
  }
  return { ...gate, tournament };
}

/** Comparação em tempo constante (não vaza, pelo tempo de resposta, quanto do segredo acertou). */
export function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Chamadas do robô (`cron-import`): header `x-cron-secret` = `CRON_PUSH_SECRET`.
 * Devolve a resposta de erro, ou null quando autorizado.
 */
export function requireCronSecret(request: NextRequest | Request): NextResponse | null {
  const secret = process.env.CRON_PUSH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_PUSH_SECRET não configurado no servidor.' }, { status: 500 });
  }
  if (!secretsMatch(request.headers.get('x-cron-secret'), secret)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  return null;
}
