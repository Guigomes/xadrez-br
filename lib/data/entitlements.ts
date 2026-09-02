import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Chaves da régua de plano. Espelham `plan_entitlements.key` (migration 073).
 * Manter como union pra um typo virar erro de compilação em vez de um gate
 * que silenciosamente nunca libera (linha ausente = não liberado).
 */
export type EntitlementKey =
  | 'tournaments.active'
  | 'tournament.players'
  | 'tournament.groups'
  | 'classification.bands'
  | 'registration.payment'
  | 'staff.delegate'
  | 'notifications.push'
  | 'export.trf'
  | 'series.enabled'
  | 'import.chessresults'
  | 'branding.custom'
  | 'support.priority'
  | 'account.multiuser';

export interface Entitlement {
  key: EntitlementKey;
  enabled: boolean;
  /** null = sem teto. */
  limit: number | null;
  /** Consumo atual, quando a chave é contável (hoje só tournaments.active). */
  used: number | null;
}

export interface Entitlements {
  byKey: Record<string, Entitlement | undefined>;
  /** Liberado? Chave desconhecida ou ausente = false (fecha por padrão). */
  can(key: EntitlementKey): boolean;
  /** Teto numérico; null = sem teto. */
  limitOf(key: EntitlementKey): number | null;
  /** Consumo atual; null quando a chave não é contável. */
  usedOf(key: EntitlementKey): number | null;
  /** Já bateu no teto? false quando não há teto. */
  atLimit(key: EntitlementKey): boolean;
}

const EMPTY: Entitlement[] = [];

/**
 * Régua do usuário logado, memoizada por request (mesmo motivo de
 * lib/data/session.ts): layout, página e componentes perguntam à vontade sem
 * multiplicar round-trip.
 *
 * Fonte única: quem responde é `get_my_entitlements()` no Postgres — a mesma
 * função que o trigger e os RPCs consultam. A tela nunca recalcula a regra,
 * só exibe o que veio.
 */
export const getEntitlements = cache(async (): Promise<Entitlements> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_entitlements');

  const rows = (error || !data ? EMPTY : (data as unknown as {
    key: string; enabled: boolean; limit_int: number | null; used: number | null;
  }[]).map((r) => ({
    key: r.key as EntitlementKey,
    enabled: r.enabled,
    limit: r.limit_int,
    used: r.used,
  }))) as Entitlement[];

  const byKey: Record<string, Entitlement | undefined> = {};
  for (const e of rows) byKey[e.key] = e;

  return {
    byKey,
    can: (key) => byKey[key]?.enabled ?? false,
    limitOf: (key) => byKey[key]?.limit ?? null,
    usedOf: (key) => byKey[key]?.used ?? null,
    atLimit: (key) => {
      const e = byKey[key];
      if (!e || e.limit === null || e.used === null) return false;
      return e.used >= e.limit;
    },
  };
});
