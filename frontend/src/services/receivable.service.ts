import { apiRequest } from './api';
import type { PaymentMethod } from '../types/payable';
import type { ClientStatement, PaginatedReceivables, Receivable, ReceivablesSummary, ReceivableStatus } from '../types/receivable';

export interface ListReceivablesParams { search?: string; status?: ReceivableStatus; clientId?: string; dueFrom?: string; dueTo?: string; page: number; pageSize: number; sortBy: 'number' | 'dueDate' | 'originalAmount' | 'receivedAmount' | 'status' | 'createdAt'; sortOrder: 'asc' | 'desc' }
const queryString = (params: object) => { const query = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return query.toString(); };
export const receivablesApi = {
  list: (token: string, params: ListReceivablesParams) => apiRequest<PaginatedReceivables>(`/receivables?${queryString(params)}`, {}, token),
  summary: (token: string, days = 30) => apiRequest<ReceivablesSummary>(`/receivables/summary?days=${days}`, {}, token),
  statement: (token: string, clientId: string, page = 1) => apiRequest<ClientStatement>(`/receivables/clients/${clientId}/statement?page=${page}&pageSize=20`, {}, token),
  async getById(token: string, id: string) { return (await apiRequest<{ receivable: Receivable }>(`/receivables/${id}`, {}, token)).receivable; },
  async collect(token: string, id: string, input: { amount: string; method: PaymentMethod; bankAccountId?: string; idempotencyKey?: string; receivedAt?: string; notes?: string }) { return (await apiRequest<{ receivable: Receivable }>(`/receivables/${id}/collections`, { method: 'POST', body: JSON.stringify(input) }, token)).receivable; },
  async reverse(token: string, id: string, collectionId: string, reason: string) { return (await apiRequest<{ receivable: Receivable }>(`/receivables/${id}/collections/${collectionId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }, token)).receivable; },
  async cancel(token: string, id: string) { return (await apiRequest<{ receivable: Receivable }>(`/receivables/${id}/cancel`, { method: 'POST' }, token)).receivable; },
};
