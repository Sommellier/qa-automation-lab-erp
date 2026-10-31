import type { OrderStatus } from './order';

export interface DashboardLowStockProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
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
    last30Days: Array<{ date: string; count: number }>;
  };
  revenue: { completed: string };
}
