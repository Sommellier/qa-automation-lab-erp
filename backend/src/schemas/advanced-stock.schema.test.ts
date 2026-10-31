import { describe, expect, it } from 'vitest';
import {
  advancedStockQuerySchema,
  createStockAdjustmentSchema,
  createStockTransferSchema,
  createWarehouseSchema,
  purchaseTraceSchema,
  receiveTransferSchema,
} from './advanced-stock.schema.js';

const warehouseA = '11111111-1111-4111-8111-111111111111';
const warehouseB = '22222222-2222-4222-8222-222222222222';
const locationA = '33333333-3333-4333-8333-333333333333';
const locationB = '44444444-4444-4444-8444-444444444444';
const productId = '55555555-5555-4555-8555-555555555555';

describe('contratos do estoque avançado', () => {
  it('CT001: normaliza o código do depósito e rejeita campos desconhecidos', () => {
    expect(createWarehouseSchema.parse({ code: ' principal ', name: 'Depósito principal' }).code).toBe('PRINCIPAL');
    expect(createWarehouseSchema.safeParse({ code: 'A', name: 'A', legacy: true }).success).toBe(false);
  });

  it('CT002-004: valida origem, destino e quantidade da transferência', () => {
    const item = { productId, sourceLocationId: locationA, destinationLocationId: locationB, quantity: 2, serialIds: [] };
    expect(createStockTransferSchema.safeParse({ sourceWarehouseId: warehouseA, destinationWarehouseId: warehouseB, items: [item] }).success).toBe(true);
    expect(createStockTransferSchema.safeParse({ sourceWarehouseId: warehouseA, destinationWarehouseId: warehouseA, items: [item] }).success).toBe(false);
    expect(createStockTransferSchema.safeParse({ sourceWarehouseId: warehouseA, destinationWarehouseId: warehouseB, items: [{ ...item, quantity: 0 }] }).success).toBe(false);
  });

  it('CT003: exige quantidade recebida ou perdida no recebimento parcial', () => {
    expect(receiveTransferSchema.safeParse({ items: [{ itemId: productId, quantity: 1, lostQuantity: 0 }] }).success).toBe(true);
    expect(receiveTransferSchema.safeParse({ items: [{ itemId: productId, quantity: 0, lostQuantity: 0 }] }).success).toBe(false);
  });

  it('CT005-007: valida datas e impede números de série duplicados', () => {
    expect(purchaseTraceSchema.safeParse({ lotCode: 'L-01', manufactureDate: '2026-01-01', expirationDate: '2027-01-01', serialNumbers: ['SN-1', 'SN-2'] }).success).toBe(true);
    expect(purchaseTraceSchema.safeParse({ manufactureDate: '2027-01-01', expirationDate: '2026-01-01', serialNumbers: [] }).success).toBe(false);
    expect(purchaseTraceSchema.safeParse({ serialNumbers: ['sn-1', 'SN-1'] }).success).toBe(false);
  });

  it('CT010-012: valida ajuste controlado e normaliza custo decimal', () => {
    const result = createStockAdjustmentSchema.parse({ warehouseId: warehouseA, reason: 'Correção aprovada', items: [{ productId, locationId: locationA, type: 'POSITIVE', quantity: 2, unitCost: '12,5' }] });
    expect(result.items[0]?.unitCost).toBe('12.500000');
    expect(createStockAdjustmentSchema.safeParse({ warehouseId: warehouseA, reason: '', items: [] }).success).toBe(false);
  });

  it('CT019: restringe filtros de rastreabilidade a tipos válidos e períodos coerentes', () => {
    expect(advancedStockQuerySchema.safeParse({ type: 'PURCHASE_RECEIPT', from: '2026-01-01', to: '2026-12-31' }).success).toBe(true);
    expect(advancedStockQuerySchema.safeParse({ type: 'INVENTADO' }).success).toBe(false);
    expect(advancedStockQuerySchema.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success).toBe(false);
  });
});
