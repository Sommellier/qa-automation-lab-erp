import { AuditAction, AuditEntity } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { listAuditQuerySchema } from './audit.schema.js';

describe('listAuditQuerySchema', () => {
  it('aplica paginação e ordenação padrão mais recente primeiro', () => {
    expect(listAuditQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20, sortOrder: 'desc' });
  });

  it('converte filtros e datas em limites UTC inclusivos', () => {
    const userId = '4d10b2fe-d0ab-41f1-bf27-b2fcb4e99c0a';
    const parsed = listAuditQuerySchema.parse({ entityType: AuditEntity.PRODUCT, action: AuditAction.DEACTIVATE, userId, dateFrom: '2026-09-01', dateTo: '2026-09-27', sortOrder: 'asc' });
    expect(parsed).toMatchObject({ entityType: AuditEntity.PRODUCT, action: AuditAction.DEACTIVATE, userId, sortOrder: 'asc' });
    expect(parsed.dateFrom?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(parsed.dateTo?.toISOString()).toBe('2026-09-27T23:59:59.999Z');
  });

  it('rejeita período invertido, enum inválido e página excessiva', () => {
    expect(listAuditQuerySchema.safeParse({ dateFrom: '2026-09-28', dateTo: '2026-09-27' }).success).toBe(false);
    expect(listAuditQuerySchema.safeParse({ action: 'LOGIN' }).success).toBe(false);
    expect(listAuditQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
