import { describe, expect, it } from 'vitest';
import {
  canDeliver,
  formatPriceBRL,
  initialOrderState,
  isValidCpfCnpjShape,
  reportOrderPatchForPayment,
  resolveReportCharge,
} from '../reports/orders';

describe('cobrança do relatório', () => {
  it('é gratuito com a cobrança global desligada, qualquer que seja o preço', () => {
    expect(resolveReportCharge(false, 3900)).toEqual({ charge: false, priceCents: 0 });
  });

  it('é gratuito sem preço válido', () => {
    expect(resolveReportCharge(true, null)).toEqual({ charge: false, priceCents: 0 });
    expect(resolveReportCharge(true, 0)).toEqual({ charge: false, priceCents: 0 });
    expect(resolveReportCharge(true, -100)).toEqual({ charge: false, priceCents: 0 });
    expect(resolveReportCharge(true, Number.NaN)).toEqual({ charge: false, priceCents: 0 });
  });

  it('cobra com cobrança ligada e preço positivo, em centavos inteiros', () => {
    expect(resolveReportCharge(true, 3900)).toEqual({ charge: true, priceCents: 3900 });
    expect(resolveReportCharge(true, 3900.9)).toEqual({ charge: true, priceCents: 3900 });
  });

  it('pedido nasce aguardando pagamento só quando há cobrança', () => {
    expect(initialOrderState({ charge: true, priceCents: 3900 })).toEqual({ status: 'awaiting_payment', paymentStatus: 'pending' });
    expect(initialOrderState({ charge: false, priceCents: 0 })).toEqual({ status: 'requested', paymentStatus: 'none' });
  });
});

describe('entrega do relatório', () => {
  it('não entrega pedido cobrado sem pagamento confirmado', () => {
    expect(canDeliver({ priceCents: 3900, paymentStatus: 'pending', status: 'awaiting_payment' })).toBe(false);
    expect(canDeliver({ priceCents: 3900, paymentStatus: 'overdue', status: 'awaiting_payment' })).toBe(false);
    expect(canDeliver({ priceCents: 3900, paymentStatus: 'refunded', status: 'paid' })).toBe(false);
  });

  it('entrega pedido pago ou gratuito, e nunca pedido cancelado', () => {
    expect(canDeliver({ priceCents: 3900, paymentStatus: 'paid', status: 'paid' })).toBe(true);
    expect(canDeliver({ priceCents: 0, paymentStatus: 'none', status: 'requested' })).toBe(true);
    expect(canDeliver({ priceCents: 0, paymentStatus: 'none', status: 'canceled' })).toBe(false);
  });
});

describe('eventos de pagamento da Asaas no pedido', () => {
  it('pagamento confirmado avança o pedido que aguardava pagamento', () => {
    expect(reportOrderPatchForPayment('activate', 'awaiting_payment')).toEqual({ payment_status: 'paid', status: 'paid' });
  });

  it('pagamento confirmado repetido não desfaz produção nem entrega', () => {
    expect(reportOrderPatchForPayment('activate', 'in_progress')).toEqual({ payment_status: 'paid' });
    expect(reportOrderPatchForPayment('activate', 'delivered')).toEqual({ payment_status: 'paid' });
  });

  it('atraso só marca o pagamento', () => {
    expect(reportOrderPatchForPayment('overdue', 'awaiting_payment')).toEqual({ payment_status: 'overdue' });
  });

  it('estorno cancela o que não foi entregue e preserva o histórico do que foi', () => {
    expect(reportOrderPatchForPayment('cancel', 'paid')).toEqual({ payment_status: 'refunded', status: 'canceled' });
    expect(reportOrderPatchForPayment('cancel', 'delivered')).toEqual({ payment_status: 'refunded' });
  });
});

describe('formatação e validação', () => {
  it('formata preço em reais e zero como gratuito', () => {
    expect(formatPriceBRL(0)).toBe('Gratuito');
    expect(formatPriceBRL(3900).replace(/\s/g, ' ')).toBe('R$ 39,00');
  });

  it('aceita CPF (11 dígitos) e CNPJ (14), com ou sem máscara', () => {
    expect(isValidCpfCnpjShape('123.456.789-09')).toBe(true);
    expect(isValidCpfCnpjShape('12.345.678/0001-95')).toBe(true);
    expect(isValidCpfCnpjShape('12345')).toBe(false);
  });
});
