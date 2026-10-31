import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFinancialAdjustmentSchema, createFinancialTitleSchema, createRecurrenceSchema, reconcileSchema, updateBankAccountSchema } from './finance.schema.js';

describe('schemas do Financeiro Avançado', () => {
  const chartAccountId = randomUUID(); const costCenterId = randomUUID();
  it('aceita lançamento manual classificado e rateado', () => {
    const value = createFinancialTitleSchema.parse({ type: 'PAYABLE', description: 'Aluguel', chartAccountId, competenceDate: '2026-10-01', issueDate: '2026-10-01', dueDate: '2026-10-10', originalAmount: '1500,00', allocations: [{ costCenterId, percentage: 100 }] });
    expect(value.originalAmount).toBe('1500.00'); expect(value.draft).toBe(false);
  });
  it('rejeita vencimento anterior à emissão', () => {
    expect(() => createFinancialTitleSchema.parse({ type: 'RECEIVABLE', description: 'Serviço', chartAccountId, competenceDate: '2026-10-01', issueDate: '2026-10-10', dueDate: '2026-10-01', originalAmount: '10', allocations: [{ costCenterId, percentage: 100 }] })).toThrow();
  });
  it('exige taxa ou valor coerente com o tipo de ajuste', () => {
    expect(() => createFinancialAdjustmentSchema.parse({ kind: 'INTEREST', calculationType: 'SIMPLE_PERCENTAGE', reason: 'Atraso contratual' })).toThrow();
    expect(createFinancialAdjustmentSchema.parse({ kind: 'PENALTY', calculationType: 'FIXED', fixedAmount: '5', reason: 'Multa prevista' }).fixedAmount).toBe('5.00');
  });
  it('valida periodicidade e limites', () => {
    expect(createRecurrenceSchema.parse({ description: 'Internet', type: 'PAYABLE', amount: '100', chartAccountId, costCenterId, startDate: '2026-10-01', frequency: 'MONTHLY', dueDay: 31 }).dueDay).toBe(31);
    expect(() => createRecurrenceSchema.parse({ description: 'Internet', type: 'PAYABLE', amount: '100', chartAccountId, costCenterId, startDate: '2026-10-01', frequency: 'MONTHLY', dueDay: 32 })).toThrow();
  });
  it('aceita conciliação muitos para muitos', () => {
    const input = reconcileSchema.parse({ links: [{ bankTransactionId: randomUUID(), bankMovementId: randomUUID(), amount: '10' }, { bankTransactionId: randomUUID(), bankMovementId: randomUUID(), amount: '20' }] });
    expect(input.links).toHaveLength(2);
  });
  it('não reinjeta saldo ou moeda ao alterar apenas o status de uma conta financeira', () => {
    expect(updateBankAccountSchema.parse({ active: false })).toEqual({ active: false });
  });
});
