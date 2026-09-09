// Cliente mínimo pra API da Asaas — só o que a assinatura de plano precisa
// (cliente, assinatura recorrente, primeira cobrança). Sandbox por padrão
// via ASAAS_API_URL; produção é https://api.asaas.com/v3.
//
// MODO MOCK: sem conta Asaas ainda (ASAAS_API_KEY vazia), as três funções
// abaixo devolvem dado fake em vez de chamar a rede — dá pra exercitar o
// fluxo de assinatura inteiro (criar, checkout, confirmação) sem depender de
// credencial nenhuma. `invoiceUrl` mockado aponta pra /mock-checkout dentro
// do próprio app, que finaliza o "pagamento" chamando
// app/api/mock/asaas-confirm — essa rota se autodesliga assim que
// ASAAS_API_KEY for preenchida de verdade (ver comentário lá).

function isMockMode(): boolean {
  return !process.env.ASAAS_API_KEY;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function mockId(prefix: string): string {
  return `${prefix}_mock_${Math.random().toString(36).slice(2, 10)}`;
}

function apiUrl(): string {
  return process.env.ASAAS_API_URL ?? 'https://api-sandbox.asaas.com/v3';
}

function apiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error('ASAAS_API_KEY não configurada no servidor.');
  return key;
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey(),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.errors?.[0]?.description ?? `Asaas respondeu ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export interface AsaasCustomer {
  id: string;
}

export async function createAsaasCustomer(input: {
  name: string;
  email: string;
  cpfCnpj: string;
}): Promise<AsaasCustomer> {
  if (isMockMode()) return { id: mockId('cus') };
  return asaasFetch<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
export type AsaasCycle = 'MONTHLY' | 'YEARLY';

export interface AsaasSubscription {
  id: string;
  status: string;
}

export async function createAsaasSubscription(input: {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  cycle: AsaasCycle;
  nextDueDate: string;
  description?: string;
}): Promise<AsaasSubscription> {
  if (isMockMode()) return { id: mockId('sub'), status: 'PENDING' };
  return asaasFetch<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface AsaasPayment {
  id: string;
  status: string;
  dueDate: string;
  invoiceUrl: string;
}

interface AsaasList<T> {
  data: T[];
}

// A criação da assinatura não devolve o link de pagamento da primeira
// cobrança — isso vive num objeto `payment` separado, gerado pela Asaas
// logo em seguida. `limit=1` porque só a mais recente interessa aqui (a
// assinatura acabou de nascer).
export async function getLatestSubscriptionPayment(
  subscriptionId: string
): Promise<AsaasPayment | null> {
  if (isMockMode()) {
    return {
      id: mockId('pay'),
      status: 'PENDING',
      dueDate: new Date().toISOString().slice(0, 10),
      invoiceUrl: `${appUrl()}/mock-checkout/${subscriptionId}`,
    };
  }
  const list = await asaasFetch<AsaasList<AsaasPayment>>(
    `/subscriptions/${subscriptionId}/payments?limit=1`
  );
  return list.data[0] ?? null;
}
