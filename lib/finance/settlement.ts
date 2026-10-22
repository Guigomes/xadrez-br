// Regras puras da conciliação das inscrições pagas online (sem banco) — testáveis.

/** Converte valor em reais vindo da Asaas (number, ex.: 48.01) para centavos inteiros. */
export function reaisToCents(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Campos gravados na inscrição quando a Asaas confirma o pagamento.
 * `value` é o valor cobrado; `netValue` é o líquido depois da tarifa do gateway.
 * Sem netValue no evento, o líquido fica nulo — a conciliação considera tarifa zero
 * em vez de inventar um número.
 */
export function paidRegistrationFields(payment: { value?: unknown; netValue?: unknown }, now: Date = new Date()) {
  return {
    paid_value_cents: reaisToCents(payment.value),
    net_value_cents: reaisToCents(payment.netValue),
    paid_at: now.toISOString(),
  };
}

/** Taxa da plataforma por inscrição paga (app_settings), saneada para centavos >= 0. */
export function platformFeeCents(setting: unknown): number {
  const n = Number(setting);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export function formatCents(cents: number | string | null | undefined): string {
  const n = Number(cents ?? 0);
  return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valida o repasse informado pelo admin. */
export function parsePayoutInput(input: { amountCents?: unknown; paidOn?: unknown; method?: unknown; note?: unknown }):
  { ok: true; value: { amount_cents: number; paid_on: string; method: string; note: string | null } } | { ok: false; error: string } {
  const amount = Number(input.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'Valor do repasse inválido.' };
  const paidOn = String(input.paidOn ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn))) return { ok: false, error: 'Data do repasse inválida.' };
  const method = String(input.method ?? 'pix').trim().slice(0, 40) || 'pix';
  const note = input.note == null ? null : String(input.note).trim().slice(0, 500) || null;
  return { ok: true, value: { amount_cents: amount, paid_on: paidOn, method, note } };
}
