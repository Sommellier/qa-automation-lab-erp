import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { listPayablesQuerySchema, registerPaymentSchema, reversePaymentSchema } from './payable.schema.js';

describe('schemas de contas a pagar', () => {
  it('normaliza pagamento válido', () => {
    const parsed = registerPaymentSchema.parse({ amount: '125.5', method: 'PIX', bankAccountId: randomUUID(), paidAt: '2026-10-27', notes: 'Pagamento parcial' });
    expect(parsed.amount).toBe('125.50');
    expect(parsed.paidAt).toEqual(new Date('2026-10-27T12:00:00.000Z'));
  });

  it('rejeita valor zero, método desconhecido e campos extras', () => {
    expect(registerPaymentSchema.safeParse({ amount: '0', method: 'PIX' }).success).toBe(false);
    expect(registerPaymentSchema.safeParse({ amount: '10', method: 'CHEQUE' }).success).toBe(false);
    expect(registerPaymentSchema.safeParse({ amount: '10', method: 'PIX', payableId: 'x' }).success).toBe(false);
  });

  it('exige justificativa útil para estorno', () => {
    expect(reversePaymentSchema.safeParse({ reason: 'erro' }).success).toBe(false);
    expect(reversePaymentSchema.parse({ reason: 'Pagamento lançado em duplicidade' }).reason).toContain('duplicidade');
  });

  it('aceita atraso como filtro temporal e valida o período', () => {
    expect(listPayablesQuerySchema.parse({ status: 'OVERDUE' }).status).toBe('OVERDUE');
    expect(listPayablesQuerySchema.safeParse({ dueFrom: '2026-10-28', dueTo: '2026-10-27' }).success).toBe(false);
  });
});
