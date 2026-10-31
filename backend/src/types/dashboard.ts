import type { OrderStatus, Prisma } from '@prisma/client';

export interface DashboardOrderGroup {
  status: OrderStatus;
  _count: { _all: number };
}

export interface DashboardRecentOrderRecord {
  id: string;
  number: string;
  status: OrderStatus;
  total: Prisma.Decimal;
  createdAt: Date;
  client: { name: string };
}

export interface DashboardLowStockProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
}

export interface DashboardDailyOrderRecord {
  date: string;
  count: number;
}

export interface DashboardRepositorySnapshot {
  activeClients: number;
  activeProducts: number;
  outOfStockProducts: number;
  orderGroups: DashboardOrderGroup[];
  completedRevenue: Prisma.Decimal | null;
  recentOrders: DashboardRecentOrderRecord[];
  lowStockProducts: DashboardLowStockProduct[];
  dailyOrders: DashboardDailyOrderRecord[];
}

export interface DashboardSummary {
  generatedAt: string;
  timezone: 'UTC';
  clients: { active: number };
  products: {
    active: number;
    outOfStock: number;
    lowStock: DashboardLowStockProduct[];
  };
  orders: {
    pending: number;
    confirmed: number;
    processing: number;
    completed: number;
    cancelled: number;
    byStatus: Array<{ status: OrderStatus; count: number }>;
    recent: Array<{
      id: string;
      number: string;
      clientName: string;
      status: OrderStatus;
      total: string;
      createdAt: string;
    }>;
    last30Days: DashboardDailyOrderRecord[];
  };
  revenue: { completed: string };
}
