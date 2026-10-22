import { describe, expect, it } from 'vitest';
import { formatCents, paidRegistrationFields, parsePayoutInput, platformFeeCents, reaisToCents } from '../finance/settlement';

describe('valores da Asaas', () => {
  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(reaisToCents(48.01)).toBe(4801);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents('50')).toBe(5000);
  });

  it('valor ausente ou inválido vira nulo, não zero', () => {
    expect(reaisToCents(undefined)).toBeNull();
    expect(reaisToCents('abc')).toBeNull();
    expect(reaisToCents(-1)).toBeNull();
  });

  it('pagamento confirmado grava bruto, líquido e momento', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(paidRegistrationFields({ value: 50, netValue: 48.01 }, now)).toEqual({
      paid_value_cents: 5000, net_value_cents: 4801, paid_at: '2026-10-22T12:00:00.000Z',
    });
    expect(paidRegistrationFields({ value: 50 }, now).net_value_cents).toBeNull();
  });
});

describe('taxa da plataforma', () => {
  it('aceita só centavos positivos', () => {
    expect(platformFeeCents(300)).toBe(300);
    expect(platformFeeCents('250')).toBe(250);
    expect(platformFeeCents(0)).toBe(0);
    expect(platformFeeCents(-5)).toBe(0);
    expect(platformFeeCents(null)).toBe(0);
  });

  it('formata centavos em reais', () => {
    expect(formatCents(10002).replace(/\s/g, ' ')).toBe('R$ 100,02');
    expect(formatCents('0').replace(/\s/g, ' ')).toBe('R$ 0,00');
  });
});

describe('repasse informado pelo admin', () => {
  it('aceita valor inteiro positivo e data ISO', () => {
    expect(parsePayoutInput({ amountCents: 4000, paidOn: '2026-10-22', method: 'pix', note: ' lote 1 ' }))
      .toEqual({ ok: true, value: { amount_cents: 4000, paid_on: '2026-10-22', method: 'pix', note: 'lote 1' } });
  });

  it('recusa valor zero, negativo, fracionado ou data inválida', () => {
    expect(parsePayoutInput({ amountCents: 0, paidOn: '2026-10-22' }).ok).toBe(false);
    expect(parsePayoutInput({ amountCents: -10, paidOn: '2026-10-22' }).ok).toBe(false);
    expect(parsePayoutInput({ amountCents: 10.5, paidOn: '2026-10-22' }).ok).toBe(false);
    expect(parsePayoutInput({ amountCents: 100, paidOn: '22/10/2026' }).ok).toBe(false);
  });
});
