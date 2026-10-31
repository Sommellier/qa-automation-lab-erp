import { describe, expect, it } from 'vitest';
import { createQuoteSchema } from './quote.schema.js';

const valid = {
  clientId: '11111111-1111-4111-8111-111111111111',
  validUntil: '2026-11-30',
  reservationHours: 24,
  paymentInstallments: 1,
  firstPaymentDueDays: 30,
  paymentIntervalDays: 30,
  items: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 2, discountPercent: 5 }],
};

describe('createQuoteSchema', () => {
  it('aceita um orçamento comercial válido', () => expect(createQuoteSchema.safeParse(valid).success).toBe(true));
  it('rejeita produtos duplicados', () => {
    const result = createQuoteSchema.safeParse({ ...valid, items: [...valid.items, ...valid.items] });
    expect(result.success).toBe(false);
  });
  it('rejeita desconto acima de 100%', () => {
    expect(createQuoteSchema.safeParse({ ...valid, items: [{ ...valid.items[0], discountPercent: 101 }] }).success).toBe(false);
  });
});
