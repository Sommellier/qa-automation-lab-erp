import type { CreateProductInput, ListProductsParams, ManagedProduct, PaginatedProducts, UpdateProductInput } from '../types/product';
import { apiRequest } from './api';

function buildQuery(params: ListProductsParams): string {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), sortBy: params.sortBy, sortOrder: params.sortOrder });
  if (params.search) query.set('search', params.search);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.active !== undefined) query.set('active', String(params.active));
  return query.toString();
}

export const productsApi = {
  list(token: string, params: ListProductsParams): Promise<PaginatedProducts> { return apiRequest<PaginatedProducts>(`/products?${buildQuery(params)}`, {}, token); },
  async getById(token: string, id: string): Promise<ManagedProduct> { return (await apiRequest<{ product: ManagedProduct }>(`/products/${id}`, {}, token)).product; },
  async create(token: string, input: CreateProductInput): Promise<ManagedProduct> { return (await apiRequest<{ product: ManagedProduct }>('/products', { method: 'POST', body: JSON.stringify(input) }, token)).product; },
  async update(token: string, id: string, input: UpdateProductInput): Promise<ManagedProduct> { return (await apiRequest<{ product: ManagedProduct }>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).product; },
  async updateStatus(token: string, id: string, active: boolean): Promise<ManagedProduct> { return (await apiRequest<{ product: ManagedProduct }>(`/products/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }, token)).product; },
};
