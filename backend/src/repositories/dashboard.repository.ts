import { OrderStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { LOW_STOCK_THRESHOLD } from '../constants/inventory.js';
import type { DashboardDailyOrderRecord, DashboardRepositorySnapshot } from '../types/dashboard.js';

export interface DashboardRepository {
  load(periodStart: Date, periodEnd: Date): Promise<DashboardRepositorySnapshot>;
}

interface DailyOrderRow {
  date: string;
  count: number;
}

export class PrismaDashboardRepository implements DashboardRepository {
  async load(periodStart: Date, periodEnd: Date): Promise<DashboardRepositorySnapshot> {
    const [
      activeClients,
      activeProducts,
      outOfStockProducts,
      orderGroups,
      completedRevenue,
      recentOrders,
      lowStockProducts,
      dailyOrderRows,
    ] = await Promise.all([
      prisma.client.count({ where: { active: true } }),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count({ where: { active: true, stock: 0 } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.aggregate({ where: { status: OrderStatus.COMPLETED }, _sum: { total: true } }),
      prisma.order.findMany({
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        take: 5,
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          createdAt: true,
          client: { select: { name: true } },
        },
      }),
      prisma.product.findMany({
        where: { active: true, stock: { lte: LOW_STOCK_THRESHOLD } },
        orderBy: [{ stock: 'asc' }, { name: 'asc' }],
        take: 10,
        select: { id: true, name: true, sku: true, stock: true },
      }),
      prisma.$queryRaw<DailyOrderRow[]>`
        SELECT
          TO_CHAR(DATE_TRUNC('day', "created_at"), 'YYYY-MM-DD') AS "date",
          COUNT(*)::int AS "count"
        FROM "orders"
        WHERE "created_at" >= ${periodStart} AND "created_at" < ${periodEnd}
        GROUP BY DATE_TRUNC('day', "created_at")
        ORDER BY DATE_TRUNC('day', "created_at") ASC
      `,
    ]);

    return {
      activeClients,
      activeProducts,
      outOfStockProducts,
      orderGroups,
      completedRevenue: completedRevenue._sum.total,
      recentOrders,
      lowStockProducts,
      dailyOrders: dailyOrderRows.map((row): DashboardDailyOrderRecord => ({
        date: row.date,
        count: Number(row.count),
      })),
    };
  }
}
