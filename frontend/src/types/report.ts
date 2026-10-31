import type { OrderStatus } from './order';

export type SortOrder = 'asc' | 'desc';
export type StockStatus = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

export interface ClientReportParams { search?: string; active?: boolean; createdFrom?: string; createdTo?: string; page: number; pageSize: number; sortBy: 'name' | 'createdAt' | 'updatedAt'; sortOrder: SortOrder }
export interface ClientReportResponse { data: Array<{ id: string; name: string; document: string; email: string; phone: string | null; active: boolean; createdAt: string; updatedAt: string }>; indicators: { total: number; active: number; inactive: number; newInPeriod: number }; pagination: Pagination; timezone: 'UTC' }

export interface ProductReportParams { search?: string; categoryId?: string; active?: boolean; stockStatus: StockStatus; createdFrom?: string; createdTo?: string; page: number; pageSize: number; sortBy: 'name' | 'sku' | 'price' | 'stock' | 'createdAt'; sortOrder: SortOrder }
export interface ProductReportResponse { data: Array<{ id: string; name: string; sku: string; category: string; price: string; stock: number; active: boolean; createdAt: string }>; indicators: { total: number; active: number; inactive: number; outOfStock: number; lowStock: number; stockValue: string }; pagination: Pagination; timezone: 'UTC' }

export interface OrderReportParams { search?: string; status?: OrderStatus; clientId?: string; dateFrom?: string; dateTo?: string; minTotal?: string; maxTotal?: string; page: number; pageSize: number; sortBy: 'number' | 'total' | 'status' | 'createdAt'; sortOrder: SortOrder }
export interface OrderReportResponse { data: Array<{ id: string; number: string; status: OrderStatus; total: string; itemsCount: number; createdAt: string; updatedAt: string; client: { id: string; name: string; document: string } }>; indicators: { total: number; byStatus: Array<{ status: OrderStatus; count: number }>; averageCompletedTicket: string }; pagination: Pagination; period: ReportPeriod }

export interface RevenueReportParams { dateFrom?: string; dateTo?: string }
export interface ReportPeriod { dateFrom: string; dateTo: string; timezone: 'UTC' }
export interface RevenueReportResponse {
  indicators: { totalRevenue: string; completedOrders: number; averageTicket: string; largestOrder: string; smallestOrder: string; cancelledOrders: number; cancelledValue: string };
  daily: Array<{ date: string; revenue: string; orders: number }>;
  topProducts: Array<{ productId: string; product: string; sku: string; quantity: number; revenue: string }>;
  topClients: Array<{ clientId: string; client: string; document: string; orders: number; revenue: string }>;
  period: ReportPeriod;
}
