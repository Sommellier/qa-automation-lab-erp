import { describe, expect, it } from 'vitest';
import { clientReportQuerySchema, orderReportQuerySchema, productReportQuerySchema, revenueReportQuerySchema } from './report.schema.js';

describe('schemas de relatórios', () => {
  it('aplica paginação e ordenações seguras', () => {
    expect(clientReportQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc' });
    expect(productReportQuerySchema.parse({})).toMatchObject({ stockStatus: 'ALL', sortBy: 'name' });
    expect(orderReportQuerySchema.parse({})).toMatchObject({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('converte período UTC, status e valores monetários', () => {
    const parsed = orderReportQuerySchema.parse({ dateFrom: '2026-09-01', dateTo: '2026-09-30', minTotal: '10.10', maxTotal: '999.99', status: 'COMPLETED' });
    expect(parsed.dateFrom?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(parsed.dateTo?.toISOString()).toBe('2026-09-30T23:59:59.999Z');
    expect(parsed.minTotal?.toFixed(2)).toBe('10.10');
  });

  it('valida filtro relacional de categoria', () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';
    expect(productReportQuerySchema.parse({ categoryId })).toMatchObject({ categoryId });
    expect(productReportQuerySchema.safeParse({ categoryId: 'Informática' }).success).toBe(false);
  });

  it('rejeita períodos invertidos, totais invertidos, sort inválido e pageSize excessivo', () => {
    expect(revenueReportQuerySchema.safeParse({ dateFrom: '2026-09-30', dateTo: '2026-09-01' }).success).toBe(false);
    expect(orderReportQuerySchema.safeParse({ minTotal: '200', maxTotal: '100' }).success).toBe(false);
    expect(clientReportQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false);
    expect(productReportQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});
