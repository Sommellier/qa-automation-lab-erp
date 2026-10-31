import { ReturnFinancialAdjustmentType, ReturnItemCondition, ReturnType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { confirmReturnPhysicalSchema, createReturnSchema, inspectReturnItemSchema, listReturnsQuerySchema, returnReasonInputSchema, settleReturnAdjustmentSchema } from './return.schema.js';

const id = (value: string) => `${value.repeat(8)}-${value.repeat(4)}-4${value.repeat(3)}-8${value.repeat(3)}-${value.repeat(12)}`;

describe('schemas de devoluções e trocas', () => {
  it('aceita devolução de fornecedor com origem e tratamento compatíveis', () => {
    const parsed = createReturnSchema.parse({ type: ReturnType.SUPPLIER_RETURN, purchaseReceiptId: id('1'), reasonId: id('2'),
      financialTreatment: ReturnFinancialAdjustmentType.SUPPLIER_CREDIT, items: [{ sourceItemId: id('3'), quantity: 2 }] });
    expect(parsed.items[0]?.quantity).toBe(2);
  });

  it('exige produto substituto somente em trocas e rejeita itens duplicados', () => {
    const sourceItemId = id('3');
    expect(createReturnSchema.safeParse({ type: ReturnType.EXCHANGE, orderId: id('1'), reasonId: id('2'), items: [{ sourceItemId, quantity: 1 }] }).success).toBe(false);
    expect(createReturnSchema.safeParse({ type: ReturnType.CUSTOMER_RETURN, orderId: id('1'), reasonId: id('2'), financialTreatment: ReturnFinancialAdjustmentType.CUSTOMER_REFUND,
      items: [{ sourceItemId, quantity: 1, replacementProductId: id('4'), replacementQuantity: 1 }] }).success).toBe(false);
    expect(createReturnSchema.safeParse({ type: ReturnType.CUSTOMER_RETURN, orderId: id('1'), reasonId: id('2'), financialTreatment: ReturnFinancialAdjustmentType.CUSTOMER_REFUND,
      items: [{ sourceItemId, quantity: 1 }, { sourceItemId, quantity: 1 }] }).success).toBe(false);
  });

  it('valida condições físicas, inspeção e liquidação', () => {
    expect(confirmReturnPhysicalSchema.parse({ items: [{ itemId: id('1'), condition: ReturnItemCondition.PENDING_INSPECTION }] }).items).toHaveLength(1);
    expect(inspectReturnItemSchema.safeParse({ condition: ReturnItemCondition.PENDING_INSPECTION }).success).toBe(false);
    expect(settleReturnAdjustmentSchema.safeParse({ settlementReference: ' ' }).success).toBe(false);
  });

  it('normaliza filtros e catálogo de motivos', () => {
    expect(listReturnsQuerySchema.parse({ page: '2', type: ReturnType.EXCHANGE })).toMatchObject({ page: 2, pageSize: 10, type: ReturnType.EXCHANGE });
    expect(returnReasonInputSchema.parse({ code: ' defective ', name: ' Produto com defeito ', appliesTo: [ReturnType.CUSTOMER_RETURN] })).toMatchObject({ code: 'DEFECTIVE', name: 'Produto com defeito', active: true });
    expect(returnReasonInputSchema.safeParse({ code: 'X', name: 'Teste', appliesTo: [ReturnType.EXCHANGE, ReturnType.EXCHANGE] }).success).toBe(false);
  });
});
