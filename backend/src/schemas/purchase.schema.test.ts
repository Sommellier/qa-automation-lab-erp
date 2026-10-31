import { describe, expect, it } from 'vitest';
import { createPurchaseSchema, listPurchasesQuerySchema, purchaseApprovalCommentSchema, receivePurchaseSchema, rejectPurchaseSchema, updateApprovalRuleSchema } from './purchase.schema.js';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
describe('schemas de compras', () => {
  it('normaliza custo e aceita um pedido válido', () => {
    const parsed = createPurchaseSchema.parse({ supplierId: first, expectedAt: '2026-11-10', items: [{ productId: second, quantity: 5, unitCost: '12.5' }] });
    expect(parsed.items[0]?.unitCost).toBe('12.50');
    expect(parsed).toMatchObject({ paymentInstallments: 1, firstPaymentDueDays: 30, paymentIntervalDays: 30 });
  });
  it('rejeita produto duplicado', () => {
    const result = createPurchaseSchema.safeParse({ supplierId: first, items: [{ productId: second, quantity: 1, unitCost: '1' }, { productId: second, quantity: 2, unitCost: '2' }] });
    expect(result.success).toBe(false);
  });
  it('rejeita custo ou quantidade inválidos', () => {
    expect(createPurchaseSchema.safeParse({ supplierId: first, items: [{ productId: second, quantity: 0, unitCost: '-1' }] }).success).toBe(false);
    expect(createPurchaseSchema.safeParse({ supplierId: first, items: [{ productId: second, quantity: 1, unitCost: '0' }] }).success).toBe(false);
  });
  it('exige ao menos um item no recebimento', () => {
    expect(receivePurchaseSchema.safeParse({ items: [] }).success).toBe(false);
  });
  it('valida filtros e comentários da aprovação', () => {
    expect(listPurchasesQuerySchema.parse({ approvalStatus: 'PENDING_APPROVAL' }).approvalStatus).toBe('PENDING_APPROVAL');
    expect(purchaseApprovalCommentSchema.parse({ comment: '  Dentro da política.  ' })).toEqual({ comment: 'Dentro da política.' });
    expect(rejectPurchaseSchema.safeParse({ comment: 'não' }).success).toBe(false);
    expect(rejectPurchaseSchema.parse({ comment: 'Fornecedor não homologado.' }).comment).toBe('Fornecedor não homologado.');
  });
  it('aceita limite monetário ou alçada ilimitada', () => {
    expect(updateApprovalRuleSchema.parse({ maxAmount: '10000', active: true })).toEqual({ maxAmount: '10000.00', active: true });
    expect(updateApprovalRuleSchema.parse({ maxAmount: null, active: true })).toEqual({ maxAmount: null, active: true });
    expect(updateApprovalRuleSchema.safeParse({ maxAmount: 0, active: true }).success).toBe(false);
    expect(updateApprovalRuleSchema.safeParse({ maxAmount: '100.999', active: true }).success).toBe(false);
  });
});
