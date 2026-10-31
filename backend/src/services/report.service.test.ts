import { OrderStatus, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReportRepository } from '../repositories/report.repository.js';
import type { ClientReportSnapshot, OrderReportSnapshot, ProductReportSnapshot, RevenueReportSnapshot } from '../types/report.js';
import { ReportService } from './report.service.js';

class FakeReports implements ReportRepository {
  clientInput: unknown; productInput: unknown; orderInput: unknown; revenueInput: unknown;
  clientSnapshot!: ClientReportSnapshot; productSnapshot!: ProductReportSnapshot; orderSnapshot!: OrderReportSnapshot; revenueSnapshot!: RevenueReportSnapshot;
  async clients(input: unknown) { this.clientInput = input; return this.clientSnapshot; }
  async products(input: unknown) { this.productInput = input; return this.productSnapshot; }
  async orders(input: unknown) { this.orderInput = input; return this.orderSnapshot; }
  async revenue(input: unknown) { this.revenueInput = input; return this.revenueSnapshot; }
}

describe('ReportService', () => {
  let repository: FakeReports; let service: ReportService;
  const now = new Date('2026-09-30T15:00:00.000Z');
  beforeEach(() => {
    repository = new FakeReports(); service = new ReportService(repository, () => now);
    repository.clientSnapshot = { records: [{ id: 'c1', name: 'Cliente', document: '12345', email: 'cliente@teste.com', phone: null, active: true, createdAt: now, updatedAt: now }], recordsTotal: 1, totalClients: 8, active: 7, inactive: 1, newInPeriod: 1 };
    repository.productSnapshot = { records: [{ id: 'p1', name: 'Produto', sku: 'SKU1', category: 'Teste', price: new Prisma.Decimal('0.10'), stock: 3, active: true, createdAt: now }], total: 1, active: 1, inactive: 0, outOfStock: 0, lowStock: 1, stockValue: new Prisma.Decimal('0.30') };
    repository.orderSnapshot = { records: [{ id: 'o1', number: 'PED-1', status: OrderStatus.COMPLETED, total: new Prisma.Decimal('600'), createdAt: now, updatedAt: now, client: { id: 'c1', name: 'Cliente', document: '123' }, items: [{ quantity: 2 }, { quantity: 3 }] }], total: 3, statusGroups: [{ status: OrderStatus.COMPLETED, count: 3 }], averageCompletedTicket: new Prisma.Decimal('200') };
    repository.revenueSnapshot = { totalRevenue: new Prisma.Decimal('600'), completedOrders: 3, averageTicket: new Prisma.Decimal('200'), largestOrder: new Prisma.Decimal('300'), smallestOrder: new Prisma.Decimal('100'), cancelledOrders: 1, cancelledValue: new Prisma.Decimal('50'), daily: [{ date: '2026-09-30', revenue: new Prisma.Decimal('600'), orders: 3 }], topProducts: [{ productId: 'p1', product: 'Produto', sku: 'SKU1', quantity: 6, revenue: new Prisma.Decimal('600') }], topClients: [{ clientId: 'c1', client: 'Cliente', document: '123', orders: 3, revenue: new Prisma.Decimal('600') }] };
  });

  it('serializa clientes e indicadores sem carregar tudo', async () => {
    const result = await service.clients({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc' });
    expect(result.indicators).toEqual({ total: 8, active: 7, inactive: 1, newInPeriod: 1 });
    expect(result.pagination).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    expect(result.data[0]?.createdAt).toBe(now.toISOString());
  });

  it('preserva precisão Decimal no relatório de produtos', async () => {
    const result = await service.products({ page: 1, pageSize: 10, sortBy: 'price', sortOrder: 'asc', stockStatus: 'LOW_STOCK' });
    expect(result.data[0]?.price).toBe('0.10');
    expect(result.indicators.stockValue).toBe('0.30');
  });

  it('exporta CSV com nome humano da categoria', async () => {
    const file = await service.exportProducts({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', stockStatus: 'ALL' }, 'csv');
    expect(file.fileName).toBe('relatorio-produtos.csv');
    expect(file.content.toString('utf8')).toContain('"Categoria"');
    expect(file.content.toString('utf8')).toContain('"Teste"');
    expect(file.content.toString('utf8')).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('exporta XLSX válido com nome humano da categoria', async () => {
    const file = await service.exportProducts({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', stockStatus: 'ALL' }, 'xlsx');
    expect(file.fileName).toBe('relatorio-produtos.xlsx');
    expect(file.content.subarray(0, 2).toString()).toBe('PK');
    expect(file.content.toString('utf8')).toContain('Teste');
  });

  it('soma quantidades dos itens e calcula ticket somente de concluídos', async () => {
    const result = await service.orders({ page: 1, pageSize: 10, sortBy: 'createdAt', sortOrder: 'desc' });
    expect(result.data[0]?.itemsCount).toBe(5);
    expect(result.indicators.averageCompletedTicket).toBe('200.00');
    expect(result.indicators.byStatus).toEqual(expect.arrayContaining([{ status: OrderStatus.PENDING, count: 0 }, { status: OrderStatus.COMPLETED, count: 3 }]));
    expect(repository.orderInput).toMatchObject({ dateFrom: new Date('2026-09-01T00:00:00.000Z'), dateTo: new Date('2026-09-30T23:59:59.999Z') });
  });

  it('retorna faturamento, série e rankings como strings monetárias', async () => {
    const result = await service.revenue({ dateFrom: new Date('2026-09-01T00:00:00.000Z'), dateTo: new Date('2026-09-30T23:59:59.999Z') });
    expect(result.indicators).toMatchObject({ totalRevenue: '600.00', completedOrders: 3, averageTicket: '200.00', largestOrder: '300.00', smallestOrder: '100.00', cancelledOrders: 1, cancelledValue: '50.00' });
    expect(result.daily[0]).toEqual({ date: '2026-09-30', revenue: '600.00', orders: 3 });
    expect(result.topProducts[0]?.revenue).toBe('600.00');
    expect(result.topClients[0]?.revenue).toBe('600.00');
  });

  it('rejeita período futuro implícito invertido', async () => {
    await expect(service.revenue({ dateFrom: new Date('2026-10-10T00:00:00.000Z') })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REPORT_PERIOD' });
  });
});
