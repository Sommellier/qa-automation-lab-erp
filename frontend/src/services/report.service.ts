import type { ClientReportParams, ClientReportResponse, OrderReportParams, OrderReportResponse, ProductReportParams, ProductReportResponse, RevenueReportParams, RevenueReportResponse } from '../types/report';
import { apiDownload, apiRequest } from './api';

function queryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  return query.toString();
}

export const reportsApi = {
  clients: (token: string, params: ClientReportParams) => apiRequest<ClientReportResponse>(`/reports/clients?${queryString(params)}`, {}, token),
  products: (token: string, params: ProductReportParams) => apiRequest<ProductReportResponse>(`/reports/products?${queryString(params)}`, {}, token),
  exportProducts: (token: string, params: ProductReportParams, format: 'csv' | 'xlsx') => apiDownload(`/reports/products/export?${queryString({ ...params, format })}`, token),
  orders: (token: string, params: OrderReportParams) => apiRequest<OrderReportResponse>(`/reports/orders?${queryString(params)}`, {}, token),
  revenue: (token: string, params: RevenueReportParams) => apiRequest<RevenueReportResponse>(`/reports/revenue?${queryString(params)}`, {}, token),
};
