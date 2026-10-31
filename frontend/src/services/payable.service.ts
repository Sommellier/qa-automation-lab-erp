import { apiRequest } from './api';
import type { PaginatedPayables, Payable, PayablesSummary, PayableStatus, PaymentMethod } from '../types/payable';

export interface ListPayablesParams {
  search?: string; status?: PayableStatus; supplierId?: string; dueFrom?: string; dueTo?: string;
  page: number; pageSize: number; sortBy: 'number' | 'dueDate' | 'originalAmount' | 'paidAmount' | 'status' | 'createdAt'; sortOrder: 'asc' | 'desc';
}
const queryString = (params: object) => { const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return query.toString(); };
export const payablesApi = {
  list: (token: string, params: ListPayablesParams) => apiRequest<PaginatedPayables>(`/payables?${queryString(params)}`, {}, token),
  summary: (token: string, days = 30) => apiRequest<PayablesSummary>(`/payables/summary?days=${days}`, {}, token),
  async getById(token: string, id: string) { return (await apiRequest<{ payable: Payable }>(`/payables/${id}`, {}, token)).payable; },
  async pay(token: string, id: string, input: { amount: string; method: PaymentMethod; bankAccountId?: string; idempotencyKey?: string; paidAt?: string; notes?: string }) {
    return (await apiRequest<{ payable: Payable }>(`/payables/${id}/payments`, { method: 'POST', body: JSON.stringify(input) }, token)).payable;
  },
  async reverse(token: string, id: string, paymentId: string, reason: string) {
    return (await apiRequest<{ payable: Payable }>(`/payables/${id}/payments/${paymentId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }, token)).payable;
  },
  async cancel(token: string, id: string) { return (await apiRequest<{ payable: Payable }>(`/payables/${id}/cancel`, { method: 'POST' }, token)).payable; },
};
