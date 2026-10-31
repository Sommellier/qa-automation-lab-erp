import { describe, expect, it } from 'vitest';
import { availableQuantity, consolidatedBalance, expiresWithin, inventoryDivergence, isExpired, movingAverageCost, outboundCost, proportionalCogsReversal, sortFefo } from './advanced-stock-rules.js';

describe('regras de estoque avançado e custos', () => {
  it('calcula disponível e consolidado sem contar trânsito duas vezes', () => {
    expect(availableQuantity({ physical: 10, reserved: 3, blocked: 2 })).toBe(5);
    expect(consolidatedBalance([{ physical: 10, reserved: 3, blocked: 2, inTransit: 4 }, { physical: 5, reserved: 0, blocked: 1, inTransit: 0 }]))
      .toEqual({ physical: 15, reserved: 3, blocked: 3, available: 9, inTransit: 4 });
  });
  it('calcula custo médio móvel com precisão decimal', () => {
    const result = movingAverageCost({ previousQuantity: 10, previousAverageCost: '20', inboundQuantity: 10, inboundUnitCost: '30' });
    expect(result.averageCost.toFixed(6)).toBe('25.000000'); expect(result.newValue.toFixed(2)).toBe('500.00');
  });
  it('mantém custo histórico na saída e no CMV', () => {
    expect(outboundCost(5, '30').amount.toFixed(2)).toBe('150.00');
    expect(proportionalCogsReversal({ originalQuantity: 10, originalAmount: '250', alreadyReversedQuantity: 2, returnedQuantity: 4 }).amount.toFixed(2)).toBe('100.00');
    expect(() => proportionalCogsReversal({ originalQuantity: 10, originalAmount: '250', alreadyReversedQuantity: 8, returnedQuantity: 3 })).toThrow('COGS_REVERSAL_EXCEEDS_ELIGIBLE');
  });
  it('classifica divergências de inventário', () => {
    expect(inventoryDivergence(10, 12)).toEqual({ quantity: 2, classification: 'SURPLUS' });
    expect(inventoryDivergence(10, 8)).toEqual({ quantity: -2, classification: 'SHORTAGE' });
  });
  it('seleciona FEFO e valida vencimento', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(isExpired(new Date('2026-10-27T00:00:00Z'), now)).toBe(true);
    expect(expiresWithin(new Date('2026-11-05T00:00:00Z'), 10, now)).toBe(true);
    const lots = sortFefo([{ code: 'SEM', expirationDate: null, createdAt: new Date('2026-01-01') }, { code: 'B', expirationDate: new Date('2026-12-01'), createdAt: new Date('2026-01-01') }, { code: 'A', expirationDate: new Date('2026-11-01'), createdAt: new Date('2026-02-01') }]);
    expect(lots.map((item) => item.code)).toEqual(['A', 'B', 'SEM']);
  });
});
