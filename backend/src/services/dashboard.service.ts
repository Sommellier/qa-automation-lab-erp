import { OrderStatus } from '@prisma/client';
import type { DashboardRepository } from '../repositories/dashboard.repository.js';
import type { DashboardSummary } from '../types/dashboard.js';

const STATUS_ORDER = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
] as const;

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class DashboardService {
  constructor(
    private readonly dashboard: DashboardRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const generatedAt = this.now();
    const periodStart = new Date(Date.UTC(
      generatedAt.getUTCFullYear(),
      generatedAt.getUTCMonth(),
      generatedAt.getUTCDate() - 29,
    ));
    const periodEnd = new Date(Date.UTC(
      generatedAt.getUTCFullYear(),
      generatedAt.getUTCMonth(),
      generatedAt.getUTCDate() + 1,
    ));
    const snapshot = await this.dashboard.load(periodStart, periodEnd);
    const counts = new Map(snapshot.orderGroups.map((group) => [group.status, group._count._all]));
    const dailyCounts = new Map(snapshot.dailyOrders.map((day) => [day.date, day.count]));
    const last30Days = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(periodStart);
      date.setUTCDate(date.getUTCDate() + index);
      const key = utcDayKey(date);
      return { date: key, count: dailyCounts.get(key) ?? 0 };
    });

    return {
      generatedAt: generatedAt.toISOString(),
      timezone: 'UTC',
      clients: { active: snapshot.activeClients },
      products: {
        active: snapshot.activeProducts,
        outOfStock: snapshot.outOfStockProducts,
        lowStock: snapshot.lowStockProducts,
      },
      orders: {
        pending: counts.get(OrderStatus.PENDING) ?? 0,
        confirmed: counts.get(OrderStatus.CONFIRMED) ?? 0,
        processing: counts.get(OrderStatus.PROCESSING) ?? 0,
        completed: counts.get(OrderStatus.COMPLETED) ?? 0,
        cancelled: counts.get(OrderStatus.CANCELLED) ?? 0,
        byStatus: STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })),
        recent: snapshot.recentOrders.map((order) => ({
          id: order.id,
          number: order.number,
          clientName: order.client.name,
          status: order.status,
          total: order.total.toFixed(2),
          createdAt: order.createdAt.toISOString(),
        })),
        last30Days,
      },
      revenue: { completed: snapshot.completedRevenue?.toFixed(2) ?? '0.00' },
    };
  }
}
