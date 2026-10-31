import { apiRequest } from './api';
import type { CostHistoryItem, PaginatedPurchases, Purchase, PurchaseApprovalRule, PurchaseApprovalStatus, PurchaseStatus } from '../types/purchase';

export interface ListPurchasesParams { search?: string; status?: PurchaseStatus; approvalStatus?: PurchaseApprovalStatus; supplierId?: string; page: number; pageSize: number; sortBy: 'number' | 'total' | 'status' | 'createdAt' | 'expectedAt'; sortOrder: 'asc' | 'desc' }
const query = (params: object) => { const value = new URLSearchParams(); Object.entries(params).forEach(([key, item]) => { if (item !== undefined && item !== '') value.set(key, String(item)); }); return value.toString(); };
export const purchasesApi = {
  list: (token: string, params: ListPurchasesParams) => apiRequest<PaginatedPurchases>(`/purchases?${query(params)}`, {}, token),
  async getById(token: string, id: string) { return (await apiRequest<{ purchase: Purchase }>(`/purchases/${id}`, {}, token)).purchase; },
  async create(token: string, input: { supplierId: string; expectedAt?: string; notes?: string; paymentInstallments: number; firstPaymentDueDays: number; paymentIntervalDays: number; items: Array<{ productId: string; quantity: number; unitCost: string }> }) { return (await apiRequest<{ purchase: Purchase }>('/purchases', { method: 'POST', body: JSON.stringify(input) }, token)).purchase; },
  async receive(token: string, id: string, input: { notes?: string; items: Array<{ productId: string; quantity: number; locationId?: string; lotCode?: string; manufactureDate?: string; expirationDate?: string; serialNumbers?: string[] }> }) { return (await apiRequest<{ purchase: Purchase }>(`/purchases/${id}/receipts`, { method: 'POST', body: JSON.stringify(input) }, token)).purchase; },
  async cancel(token: string, id: string) { return (await apiRequest<{ purchase: Purchase }>(`/purchases/${id}/cancel`, { method: 'POST' }, token)).purchase; },
  async submitForApproval(token: string, id: string, comment?: string) { return (await apiRequest<{ purchase: Purchase }>(`/purchases/${id}/submit`, { method: 'POST', body: JSON.stringify(comment ? { comment } : {}) }, token)).purchase; },
  async approve(token: string, id: string, comment?: string) { return (await apiRequest<{ purchase: Purchase }>(`/purchases/${id}/approve`, { method: 'POST', body: JSON.stringify(comment ? { comment } : {}) }, token)).purchase; },
  async reject(token: string, id: string, comment: string) { return (await apiRequest<{ purchase: Purchase }>(`/purchases/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }, token)).purchase; },
  async listApprovalRules(token: string) { return (await apiRequest<{ rules: PurchaseApprovalRule[] }>('/purchases/approval-rules', {}, token)).rules; },
  async updateApprovalRule(token: string, role: 'ADMIN' | 'ANALISTA', input: { maxAmount: string | null; active: boolean }) { return (await apiRequest<{ rule: PurchaseApprovalRule }>(`/purchases/approval-rules/${role}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).rule; },
  costHistory: (token: string, productId: string, page = 1) => apiRequest<{ data: CostHistoryItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(`/purchases/cost-history/${productId}?page=${page}&pageSize=20`, {}, token),
};
