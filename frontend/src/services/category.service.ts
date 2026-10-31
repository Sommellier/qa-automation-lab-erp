import type { CategoryOption, CreateCategoryInput, ListCategoriesParams, ManagedCategory, PaginatedCategories, UpdateCategoryInput } from '../types/category';
import { apiRequest } from './api';

const query = (params: object) => { const result = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') result.set(key, String(value)); return result.toString(); };
export const categoriesApi = {
  list: (token: string, params: ListCategoriesParams) => apiRequest<PaginatedCategories>(`/categories?${query(params)}`, {}, token),
  async options(token: string, includeInactive = false): Promise<CategoryOption[]> { return (await apiRequest<{ data: CategoryOption[] }>(`/categories/options${includeInactive ? '?includeInactive=true' : ''}`, {}, token)).data; },
  async getById(token: string, id: string): Promise<ManagedCategory> { return (await apiRequest<{ category: ManagedCategory }>(`/categories/${id}`, {}, token)).category; },
  async create(token: string, input: CreateCategoryInput): Promise<ManagedCategory> { return (await apiRequest<{ category: ManagedCategory }>('/categories', { method: 'POST', body: JSON.stringify(input) }, token)).category; },
  async update(token: string, id: string, input: UpdateCategoryInput): Promise<ManagedCategory> { return (await apiRequest<{ category: ManagedCategory }>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).category; },
  async updateStatus(token: string, id: string, active: boolean): Promise<ManagedCategory> { return (await apiRequest<{ category: ManagedCategory }>(`/categories/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }, token)).category; },
};
