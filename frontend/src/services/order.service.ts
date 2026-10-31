import type { CreateOrderInput, ListOrdersParams, ManagedOrder, OrderStatus, PaginatedOrders } from '../types/order';
import { apiRequest } from './api';

function buildQuery(params: ListOrdersParams): string {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), sortBy: params.sortBy, sortOrder: params.sortOrder });
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.client) query.set('client', params.client);
  if (params.dateStart) query.set('dateStart', params.dateStart);
  if (params.dateEnd) query.set('dateEnd', params.dateEnd);
  return query.toString();
}
export const ordersApi = {
  list(token: string, params: ListOrdersParams): Promise<PaginatedOrders> { return apiRequest<PaginatedOrders>(`/orders?${buildQuery(params)}`, {}, token); },
  async getById(token: string, id: string): Promise<ManagedOrder> { return (await apiRequest<{ order: ManagedOrder }>(`/orders/${id}`, {}, token)).order; },
  async create(token: string, input: CreateOrderInput): Promise<ManagedOrder> { return (await apiRequest<{ order: ManagedOrder }>('/orders', { method: 'POST', body: JSON.stringify(input) }, token)).order; },
  async updateStatus(token: string, id: string, status: OrderStatus): Promise<ManagedOrder> { return (await apiRequest<{ order: ManagedOrder }>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, token)).order; },
};
