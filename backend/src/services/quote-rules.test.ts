import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertWithinDiscountApprovalLimit, calculateCommission, calculateQuoteLine, effectiveDiscountPercent, isQuoteExpired, quoteReservationExpiry } from './quote-rules.js';

describe('regras do ciclo comercial', () => {
  it('calcula preço líquido, desconto e subtotal com arredondamento monetário', () => {
    const result = calculateQuoteLine('100.00', 3, '12.5');
    expect(result.unitPrice.toFixed(2)).toBe('87.50');
    expect(result.grossTotal.toFixed(2)).toBe('300.00');
    expect(result.discountTotal.toFixed(2)).toBe('37.50');
    expect(result.subtotal.toFixed(2)).toBe('262.50');
    expect(effectiveDiscountPercent(result.grossTotal, result.discountTotal).toFixed(4)).toBe('12.5000');
  });

  it('calcula a comissão sobre o valor líquido convertido', () => {
    expect(calculateCommission('262.50', '4').toFixed(2)).toBe('10.50');
  });

  it('bloqueia aprovação acima da alçada', () => {
    expect(() => assertWithinDiscountApprovalLimit('10.01', { active: true, maxDiscountPercent: new Prisma.Decimal(10) }))
      .toThrow('excede sua alçada');
  });

  it('limita a reserva à validade e reconhece expiração no fim do dia', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');
    const expiry = quoteReservationExpiry(new Date('2026-10-28T00:00:00.000Z'), 24, now);
    expect(expiry.toISOString()).toBe('2026-10-28T23:59:59.999Z');
    expect(isQuoteExpired(new Date('2026-10-28T00:00:00.000Z'), now)).toBe(false);
    expect(isQuoteExpired(new Date('2026-10-27T00:00:00.000Z'), now)).toBe(true);
  });
});
