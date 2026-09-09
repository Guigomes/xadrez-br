'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export interface PlanOption {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  description: string | null;
  price_cents: number | null;
  currency: string;
  billing_interval: string | null;
}

export interface UserPlanCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  plan_code: string | null;
  plan_name: string | null;
}

/** Catálogo de planos — leitura pública (RLS: plans_select_all), pra popular o seletor. */
export function usePlanCatalog() {
  return useQuery({
    queryKey: ['plans'],
    staleTime: 300_000,
    queryFn: async (): Promise<PlanOption[]> => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, code, name, sort_order, description, price_cents, currency, billing_interval')
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CreateSubscriptionInput {
  planCode: string;
  cpfCnpj: string;
  billingType?: 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  invoiceUrl: string | null;
}

/** Chama app/api/subscriptions/create — cria cliente+assinatura na Asaas (ou mock, sem conta configurada). */
export function useCreateSubscription() {
  return useMutation({
    mutationFn: async (input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> => {
      const res = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Erro ao criar assinatura.');
      return body;
    },
  });
}

/**
 * Autocomplete de usuário pra trocar plano — mesmo padrão de
 * useStaffCandidates (RLS de self-read em user_profiles exige RPC, migration
 * 074, gated por admin).
 */
export function useUserPlanSearch(query: string) {
  return useQuery({
    queryKey: ['user-plan-search', query.trim()],
    enabled: query.trim().length >= 3,
    staleTime: 30_000,
    queryFn: async (): Promise<UserPlanCandidate[]> => {
      const { data, error } = await supabase.rpc('search_users_for_plan', {
        p_query: query.trim(),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetUserPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, planCode }: { userId: string; planCode: string }) => {
      const { error } = await supabase.rpc('set_user_plan', {
        p_user_id: userId, p_plan_code: planCode,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-plan-search'] }),
  });
}

/** Rótulo legível pra cada chave de entitlement — usado no matriz de dev
 * (/admin/dev/plans) e na tela pública de planos (/planos). A chave em si
 * (tournaments.active etc) é o que o código lê (has_entitlement/
 * entitlement_limit) — não muda. */
export const ENTITLEMENT_LABELS: Record<string, string> = {
  'tournaments.active':   'Torneios ativos ao mesmo tempo',
  'tournament.players':   'Jogadores por torneio',
  'tournament.groups':    'Grupos de emparceiramento por torneio',
  'classification.bands': 'Classificação por faixas (idade/rating)',
  'registration.payment': 'Cobrança na inscrição',
  'staff.delegate':       'Delegar árbitros/organizadores',
  'notifications.push':   'Notificações push',
  'export.trf':           'Exportar TRF (homologação)',
  'series.enabled':       'Séries/circuitos',
  'import.chessresults':  'Importar do chess-results.com',
  'branding.custom':      'Marca própria (branding)',
  'support.priority':     'Suporte prioritário',
  'account.multiuser':    'Conta multiusuário',
};

/** Ordem de exibição — mesma ordem das chaves acima (capacidade primeiro). */
export const ENTITLEMENT_ORDER = Object.keys(ENTITLEMENT_LABELS);

/** As três chaves onde limit_int null significa "sem teto" (não "não se aplica"). */
const CAPACITY_KEYS = new Set(['tournaments.active', 'tournament.players', 'tournament.groups']);

/** Linha pronta pra exibir numa lista de funcionalidades: rótulo + teto, quando fizer sentido. */
export function formatEntitlementLine(key: string, limitInt: number | null): string {
  const label = ENTITLEMENT_LABELS[key] ?? key;
  if (limitInt !== null) return `${label} — até ${limitInt}`;
  if (CAPACITY_KEYS.has(key)) return `${label} — sem limite`;
  return label;
}

export interface EntitlementRow {
  plan_id: string;
  key: string;
  enabled: boolean;
  limit_int: number | null;
}

/** A matriz plano×funcionalidade inteira — quem libera o quê (migration 073). */
export function usePlanEntitlements() {
  return useQuery({
    queryKey: ['plan-entitlements'],
    staleTime: 30_000,
    queryFn: async (): Promise<EntitlementRow[]> => {
      const { data, error } = await supabase
        .from('plan_entitlements')
        .select('plan_id, key, enabled, limit_int');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Grava direto na tabela (RLS já libera admin escrever — plan_entitlements_
 * write_admin, migration 073). Sem RPC própria: diferente de trocar o plano
 * de um usuário (que tem trigger anti-auto-promoção), aqui não tem regra
 * especial nenhuma pra proteger.
 */
export function useUpdateEntitlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: EntitlementRow) => {
      const { error } = await supabase
        .from('plan_entitlements')
        .upsert(row, { onConflict: 'plan_id,key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-entitlements'] }),
  });
}
