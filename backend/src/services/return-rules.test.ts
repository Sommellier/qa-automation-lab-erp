import { ReturnFinancialAdjustmentType, ReturnStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { eligibleReturnQuantity, exchangeDifference, resolvedOperationalStatus } from './return-rules.js';

describe('regras de devoluções e trocas', () => {
  it('calcula saldo elegível para devolução total e parcial', () => {
    expect(eligibleReturnQuantity(10, 0)).toBe(10);
    expect(eligibleReturnQuantity(10, 4)).toBe(6);
    expect(eligibleReturnQuantity(10, 10)).toBe(0);
    expect(eligibleReturnQuantity(10, 15)).toBe(0);
  });

  it('rejeita quantidades estruturais inválidas', () => {
    expect(() => eligibleReturnQuantity(-1, 0)).toThrow('INVALID_RETURN_QUANTITY');
    expect(() => eligibleReturnQuantity(1, 0.5)).toThrow('INVALID_RETURN_QUANTITY');
  });

  it('calcula diferença a cobrar, a devolver e troca sem diferença', () => {
    expect(exchangeDifference('100.00', '125.25')).toMatchObject({ type: ReturnFinancialAdjustmentType.EXCHANGE_CHARGE });
    expect(exchangeDifference('100.00', '125.25')?.amount.toFixed(2)).toBe('25.25');
    expect(exchangeDifference('100.00', '80.00')).toMatchObject({ type: ReturnFinancialAdjustmentType.EXCHANGE_REFUND });
    expect(exchangeDifference('100.00', '80.00')?.amount.toFixed(2)).toBe('20.00');
    expect(exchangeDifference('100.00', '100.00')).toBeNull();
  });

  it('prioriza inspeção, depois financeiro e só então conclusão', () => {
    expect(resolvedOperationalStatus(true, true)).toBe(ReturnStatus.AWAITING_INSPECTION);
    expect(resolvedOperationalStatus(false, true)).toBe(ReturnStatus.AWAITING_FINANCIAL);
    expect(resolvedOperationalStatus(false, false)).toBe(ReturnStatus.COMPLETED);
  });
});
