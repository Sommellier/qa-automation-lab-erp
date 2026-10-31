import type { OrderStatus, Prisma } from '@prisma/client';

export type SortOrder = 'asc' | 'desc';
export type StockStatus = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface ReportPaginationInput { page: number; pageSize: number }
export interface ReportPagination { page: number; pageSize: number; total: number; totalPages: number }

export interface ClientReportInput extends ReportPaginationInput {
  search?: string | undefined; active?: boolean | undefined; createdFrom?: Date | undefined; createdTo?: Date | undefined;
  sortBy: 'name' | 'createdAt' | 'updatedAt'; sortOrder: SortOrder;
}
export interface ClientReportRecord { id: string; name: string; document: string; email: string; phone: string | null; active: boolean; createdAt: Date; updatedAt: Date }
export interface ClientReportSnapshot { records: ClientReportRecord[]; recordsTotal: number; totalClients: number; active: number; inactive: number; newInPeriod: number }

export interface ProductReportInput extends ReportPaginationInput {
  search?: string | undefined; categoryId?: string | undefined; active?: boolean | undefined; stockStatus: StockStatus;
  createdFrom?: Date | undefined; createdTo?: Date | undefined;
  sortBy: 'name' | 'sku' | 'price' | 'stock' | 'createdAt'; sortOrder: SortOrder;
}
export interface ProductReportRecord { id: string; name: string; sku: string; category: string; price: Prisma.Decimal; stock: number; active: boolean; createdAt: Date }
export interface ProductReportSnapshot { records: ProductReportRecord[]; total: number; active: number; inactive: number; outOfStock: number; lowStock: number; stockValue: Prisma.Decimal }

export interface OrderReportInput extends ReportPaginationInput {
  search?: string | undefined; status?: OrderStatus | undefined; clientId?: string | undefined;
  dateFrom: Date; dateTo: Date; minTotal?: Prisma.Decimal | undefined; maxTotal?: Prisma.Decimal | undefined;
  sortBy: 'number' | 'total' | 'status' | 'createdAt'; sortOrder: SortOrder;
}
export interface OrderReportRecord {
  id: string; number: string; status: OrderStatus; total: Prisma.Decimal; createdAt: Date; updatedAt: Date;
  client: { id: string; name: string; document: string }; items: Array<{ quantity: number }>;
}
export interface OrderReportSnapshot { records: OrderReportRecord[]; total: number; statusGroups: Array<{ status: OrderStatus; count: number }>; averageCompletedTicket: Prisma.Decimal | null }

export interface RevenueReportInput { dateFrom: Date; dateTo: Date }
export interface RevenueDailyRecord { date: string; revenue: Prisma.Decimal; orders: number }
export interface RevenueTopProduct { productId: string; product: string; sku: string; quantity: number; revenue: Prisma.Decimal }
export interface RevenueTopClient { clientId: string; client: string; document: string; orders: number; revenue: Prisma.Decimal }
export interface RevenueReportSnapshot {
  totalRevenue: Prisma.Decimal | null; completedOrders: number; averageTicket: Prisma.Decimal | null;
  largestOrder: Prisma.Decimal | null; smallestOrder: Prisma.Decimal | null;
  cancelledOrders: number; cancelledValue: Prisma.Decimal | null;
  daily: RevenueDailyRecord[]; topProducts: RevenueTopProduct[]; topClients: RevenueTopClient[];
}
