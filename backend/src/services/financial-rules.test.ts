import { FinancialAdjustmentKind, FinancialCalculationType, FinancialRecurrenceFrequency, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { allocateByPercentage, calculateFinancialAdjustment, nextRecurrenceDate, reconciliationConfidence } from './financial-rules.js';

describe('regras monetárias financeiras', () => {
  it('rateia centavos sem perda', () => {
    const result = allocateByPercentage('100.01', [
      { costCenterId: 'a', percentage: '33.3333' },
      { costCenterId: 'b', percentage: '33.3333' },
      { costCenterId: 'c', percentage: '33.3334' },
    ]);
    expect(result.map((item) => item.amount.toFixed(2))).toEqual(['33.33', '33.33', '33.35']);
    expect(result.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0)).toFixed(2)).toBe('100.01');
  });

  it('rejeita rateio diferente de cem por cento', () => {
    expect(() => allocateByPercentage('10', [{ costCenterId: 'a', percentage: '90' }])).toThrow('ALLOCATION_PERCENTAGE_TOTAL');
  });

  it('calcula juros simples proporcionais ao período', () => {
    const result = calculateFinancialAdjustment({ kind: FinancialAdjustmentKind.INTEREST,
      calculationType: FinancialCalculationType.SIMPLE_PERCENTAGE, baseAmount: '1000', rate: '3',
      periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-16T00:00:00Z') });
    expect(result.calculatedAmount.toFixed(2)).toBe('15.00');
    expect(result.days).toBe(15);
  });

  it('trata o dia 31 no próximo mês', () => {
    expect(nextRecurrenceDate(new Date('2026-01-31T00:00:00Z'), FinancialRecurrenceFrequency.MONTHLY, 31).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(nextRecurrenceDate(new Date('2028-01-31T00:00:00Z'), FinancialRecurrenceFrequency.MONTHLY, 31).toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('só considera correspondência determinística com referência e valor', () => {
    expect(reconciliationConfidence({ transactionAmount: '50', movementAmount: '50', transactionDate: new Date('2026-10-27'), movementDate: new Date('2026-10-27') }).deterministic).toBe(false);
    expect(reconciliationConfidence({ transactionAmount: '50', movementAmount: '50', transactionDate: new Date('2026-10-27'), movementDate: new Date('2026-10-28'), transactionReference: 'ABC', movementReference: 'abc' }).deterministic).toBe(true);
  });
});
