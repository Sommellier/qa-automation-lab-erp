import { apiRequest } from './api';
import type { ListSuppliersParams, PaginatedSuppliers, Supplier, SupplierInput } from '../types/supplier';

const query = (params: ListSuppliersParams) => {
  const value = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), sortBy: params.sortBy, sortOrder: params.sortOrder });
  if (params.search) value.set('search', params.search);
  if (params.active !== undefined) value.set('active', String(params.active));
  return value.toString();
};
export const suppliersApi = {
  list: (token: string, params: ListSuppliersParams) => apiRequest<PaginatedSuppliers>(`/suppliers?${query(params)}`, {}, token),
  async getById(token: string, id: string) { return (await apiRequest<{ supplier: Supplier }>(`/suppliers/${id}`, {}, token)).supplier; },
  async create(token: string, input: SupplierInput) { return (await apiRequest<{ supplier: Supplier }>('/suppliers', { method: 'POST', body: JSON.stringify(input) }, token)).supplier; },
  async update(token: string, id: string, input: Partial<Omit<SupplierInput, 'active'>>) { return (await apiRequest<{ supplier: Supplier }>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).supplier; },
  async updateStatus(token: string, id: string, active: boolean) { return (await apiRequest<{ supplier: Supplier }>(`/suppliers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }, token)).supplier; },
};
