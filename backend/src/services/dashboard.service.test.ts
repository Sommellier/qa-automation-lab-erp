import { randomUUID } from 'node:crypto';
import { OrderStatus, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { DashboardRepository } from '../repositories/dashboard.repository.js';
import type { DashboardRepositorySnapshot } from '../types/dashboard.js';
import { DashboardService } from './dashboard.service.js';

class FakeDashboardRepository implements DashboardRepository {
  periodStart?: Date;
  periodEnd?: Date;

  constructor(private readonly snapshot: DashboardRepositorySnapshot) {}

  async load(periodStart: Date, periodEnd: Date): Promise<DashboardRepositorySnapshot> {
    this.periodStart = periodStart;
    this.periodEnd = periodEnd;
    return this.snapshot;
  }
}

function makeSnapshot(): DashboardRepositorySnapshot {
  return {
    activeClients: 12,
    activeProducts: 8,
    outOfStockProducts: 2,
    orderGroups: [
      { status: OrderStatus.PENDING, _count: { _all: 3 } },
      { status: OrderStatus.CONFIRMED, _count: { _all: 4 } },
      { status: OrderStatus.PROCESSING, _count: { _all: 5 } },
      { status: OrderStatus.COMPLETED, _count: { _all: 6 } },
      { status: OrderStatus.CANCELLED, _count: { _all: 7 } },
    ],
    completedRevenue: new Prisma.Decimal('184540.90'),
    recentOrders: [{
      id: randomUUID(), number: 'PED-000010', status: OrderStatus.COMPLETED,
      total: new Prisma.Decimal('99.90'), createdAt: new Date('2026-09-27T15:30:00.000Z'),
      client: { name: 'Carlos Silva' },
    }],
    lowStockProducts: [{ id: randomUUID(), name: 'Mouse', sku: 'MOUSE001', stock: 0 }],
    dailyOrders: [{ date: '2026-09-26', count: 9 }],
  };
}

describe('DashboardService', () => {
  it('monta todos os indicadores, listas e gráfico temporal', async () => {
    const repository = new FakeDashboardRepository(makeSnapshot());
    const service = new DashboardService(repository, () => new Date('2026-09-27T18:00:00.000Z'));
    const summary = await service.getSummary();

    expect(summary.clients.active).toBe(12);
    expect(summary.products).toMatchObject({ active: 8, outOfStock: 2 });
    expect(summary.orders).toMatchObject({ pending: 3, confirmed: 4, processing: 5, completed: 6, cancelled: 7 });
    expect(summary.revenue.completed).toBe('184540.90');
    expect(summary.orders.recent[0]).toMatchObject({ number: 'PED-000010', clientName: 'Carlos Silva', total: '99.90' });
    expect(summary.products.lowStock[0]).toMatchObject({ sku: 'MOUSE001', stock: 0 });
    expect(summary.orders.last30Days).toHaveLength(30);
    expect(summary.orders.last30Days.at(-2)).toEqual({ date: '2026-09-26', count: 9 });
    expect(summary.orders.last30Days[0]?.date).toBe('2026-08-29');
    expect(repository.periodStart?.toISOString()).toBe('2026-08-29T00:00:00.000Z');
    expect(repository.periodEnd?.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(summary.timezone).toBe('UTC');
  });

  it('preenche status, receita e dias ausentes com zero', async () => {
    const snapshot = makeSnapshot();
    snapshot.orderGroups = [];
    snapshot.completedRevenue = null;
    snapshot.dailyOrders = [];
    const summary = await new DashboardService(
      new FakeDashboardRepository(snapshot),
      () => new Date('2026-09-27T18:00:00.000Z'),
    ).getSummary();

    expect(summary.orders.byStatus.every((item) => item.count === 0)).toBe(true);
    expect(summary.orders.pending).toBe(0);
    expect(summary.revenue.completed).toBe('0.00');
    expect(summary.orders.last30Days.every((item) => item.count === 0)).toBe(true);
  });
});
