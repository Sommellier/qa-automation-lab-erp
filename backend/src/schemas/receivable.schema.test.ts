import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { listReceivablesQuerySchema, registerCollectionSchema, reverseCollectionSchema } from './receivable.schema.js';

describe('schemas de contas a receber', () => {
  it('normaliza um recebimento válido', () => {
    const parsed = registerCollectionSchema.parse({ amount: '89.9', method: 'PIX', bankAccountId: randomUUID(), receivedAt: '2026-10-27' });
    expect(parsed.amount).toBe('89.90');
    expect(parsed.receivedAt).toEqual(new Date('2026-10-27T12:00:00.000Z'));
  });
  it('rejeita valor zero, método inválido e campo extra', () => {
    expect(registerCollectionSchema.safeParse({ amount: '0', method: 'PIX' }).success).toBe(false);
    expect(registerCollectionSchema.safeParse({ amount: '10', method: 'CHEQUE' }).success).toBe(false);
    expect(registerCollectionSchema.safeParse({ amount: '10', method: 'PIX', clientId: 'x' }).success).toBe(false);
  });
  it('valida estorno, atraso e período', () => {
    expect(reverseCollectionSchema.safeParse({ reason: 'erro' }).success).toBe(false);
    expect(listReceivablesQuerySchema.parse({ status: 'OVERDUE' }).status).toBe('OVERDUE');
    expect(listReceivablesQuerySchema.safeParse({ dueFrom: '2026-11-02', dueTo: '2026-11-01' }).success).toBe(false);
  });
});
