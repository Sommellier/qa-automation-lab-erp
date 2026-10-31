import { randomUUID } from 'node:crypto';
import { OrderStatus, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  clientCount: vi.fn(),
  productCount: vi.fn(),
  productFindMany: vi.fn(),
  orderGroupBy: vi.fn(),
  orderAggregate: vi.fn(),
  orderFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    client: { count: mock.clientCount },
    product: { count: mock.productCount, findMany: mock.productFindMany },
    order: { groupBy: mock.orderGroupBy, aggregate: mock.orderAggregate, findMany: mock.orderFindMany },
    $queryRaw: mock.queryRaw,
  },
}));

import { PrismaDashboardRepository } from './dashboard.repository.js';

describe('PrismaDashboardRepository', () => {
  beforeEach(() => {
    Object.values(mock).forEach((method) => method.mockReset());
    mock.clientCount.mockResolvedValue(3);
    mock.productCount.mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    mock.orderGroupBy.mockResolvedValue([{ status: OrderStatus.COMPLETED, _count: { _all: 2 } }]);
    mock.orderAggregate.mockResolvedValue({ _sum: { total: new Prisma.Decimal('319.90') } });
    mock.orderFindMany.mockResolvedValue([{
      id: randomUUID(), number: 'PED-000010', status: OrderStatus.COMPLETED,
      total: new Prisma.Decimal('119.90'), createdAt: new Date('2026-09-27T10:00:00.000Z'),
      client: { name: 'Carlos Silva' },
    }]);
    mock.productFindMany.mockResolvedValue([{
      id: randomUUID(), name: 'Mouse', sku: 'MOUSE001', stock: 0,
    }]);
    mock.queryRaw.mockResolvedValue([{ date: '2026-09-27', count: 2 }]);
  });

  it('usa agregações e seleções limitadas sem carregar tabelas inteiras', async () => {
    const repository = new PrismaDashboardRepository();
    const start = new Date('2026-08-29T00:00:00.000Z');
    const end = new Date('2026-09-28T00:00:00.000Z');
    const result = await repository.load(start, end);

    expect(mock.clientCount).toHaveBeenCalledWith({ where: { active: true } });
    expect(mock.productCount).toHaveBeenNthCalledWith(1, { where: { active: true } });
    expect(mock.productCount).toHaveBeenNthCalledWith(2, { where: { active: true, stock: 0 } });
    expect(mock.orderGroupBy).toHaveBeenCalledWith({ by: ['status'], _count: { _all: true } });
    expect(mock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, select: expect.any(Object) }));
    expect(mock.productFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, stock: { lte: 5 } }, take: 10, select: expect.any(Object),
    }));
    expect(mock.queryRaw).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ activeClients: 3, activeProducts: 4, outOfStockProducts: 1 });
  });

  it('soma receita exclusivamente de pedidos concluídos', async () => {
    await new PrismaDashboardRepository().load(
      new Date('2026-08-29T00:00:00.000Z'),
      new Date('2026-09-28T00:00:00.000Z'),
    );

    expect(mock.orderAggregate).toHaveBeenCalledWith({
      where: { status: OrderStatus.COMPLETED },
      _sum: { total: true },
    });
  });
});
