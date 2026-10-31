import { PayableStatus, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { effectivePayableStatus } from '../types/payable.js';
import { buildPayableInstallments } from './payable-installments.js';

describe('parcelamento de contas a pagar', () => {
  it('divide centavos sem perder ou criar valor', () => {
    const installments = buildPayableInstallments(new Prisma.Decimal('100.00'), 3, 10, 30, new Date('2026-10-27T18:00:00Z'));
    expect(installments.map((item) => item.amount.toFixed(2))).toEqual(['33.34', '33.33', '33.33']);
    expect(installments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)).toFixed(2)).toBe('100.00');
    expect(installments.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual(['2026-11-06', '2026-12-06', '2027-01-05']);
  });

  it('mantém uma parcela integral', () => {
    const [installment] = buildPayableInstallments(new Prisma.Decimal('19.99'), 1, 0, 30, new Date('2026-10-27T00:00:00Z'));
    expect(installment?.amount.toFixed(2)).toBe('19.99');
    expect(installment?.dueDate.toISOString().slice(0, 10)).toBe('2026-10-27');
  });

  it('deriva atraso somente para títulos abertos vencidos', () => {
    const today = new Date('2026-10-27T00:00:00Z');
    expect(effectivePayableStatus(PayableStatus.PENDING, new Date('2026-10-26'), today)).toBe('OVERDUE');
    expect(effectivePayableStatus(PayableStatus.PARTIALLY_PAID, new Date('2026-10-26'), today)).toBe('OVERDUE');
    expect(effectivePayableStatus(PayableStatus.PAID, new Date('2026-10-26'), today)).toBe('PAID');
    expect(effectivePayableStatus(PayableStatus.PENDING, new Date('2026-10-27'), today)).toBe('PENDING');
  });
});
