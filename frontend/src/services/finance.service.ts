import { apiDownload, apiRequest } from './api';
import type { BankAccount, BankMovement, BankTransaction, CashFlowReport, ChartAccount, CostCenter, DreReport, FinanceSetup, FinancialDashboard, FinancialRecurrence, FinancialTitle, FinancialTitleType, PaginatedFinancialTitles } from '../types/finance';

const query = (input: Record<string, unknown>) => { const params = new URLSearchParams(); Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); }); return params.toString(); };
export const financeApi = {
  setup: (token: string) => apiRequest<FinanceSetup>('/finance/setup', {}, token),
  dashboard: (token: string, params: { from: string; to: string; groupBy?: string; bankAccountId?: string; chartAccountId?: string; costCenterId?: string }) => apiRequest<FinancialDashboard>(`/finance/dashboard?${query(params)}`, {}, token),
  dre: (token: string, params: Record<string, unknown>) => apiRequest<DreReport>(`/finance/reports/dre?${query(params)}`, {}, token),
  cashFlow: (token: string, params: Record<string, unknown>) => apiRequest<CashFlowReport>(`/finance/reports/cash-flow?${query(params)}`, {}, token),
  exportDre: (token: string, params: Record<string, unknown>) => apiDownload(`/finance/reports/dre/export?${query(params)}`, token),
  listTitles: (token: string, params: Record<string, unknown>) => apiRequest<PaginatedFinancialTitles>(`/finance/titles?${query(params)}`, {}, token),
  async title(token: string, type: FinancialTitleType, id: string) { return (await apiRequest<{ title: FinancialTitle }>(`/finance/titles/${type}/${id}`, {}, token)).title; },
  async createTitle(token: string, input: unknown) { return (await apiRequest<{ title: FinancialTitle }>('/finance/titles', { method: 'POST', body: JSON.stringify(input) }, token)).title; },
  async updateTitle(token: string, type: FinancialTitleType, id: string, input: unknown) { return (await apiRequest<{ title: FinancialTitle }>(`/finance/titles/${type}/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).title; },
  async settle(token: string, type: FinancialTitleType, id: string, input: unknown) { return (await apiRequest<{ title: FinancialTitle }>(`/finance/titles/${type}/${id}/settlements`, { method: 'POST', body: JSON.stringify(input) }, token)).title; },
  async reverseSettlement(token: string, type: FinancialTitleType, id: string, settlementId: string, reason: string) { return (await apiRequest<{ title: FinancialTitle }>(`/finance/titles/${type}/${id}/settlements/${settlementId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }, token)).title; },
  async cancelTitle(token: string, type: FinancialTitleType, id: string, reason: string) { return (await apiRequest<{ title: FinancialTitle }>(`/finance/titles/${type}/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }, token)).title; },
  adjustment: (token: string, type: FinancialTitleType, id: string, input: unknown) => apiRequest(`/finance/titles/${type}/${id}/adjustments`, { method: 'POST', body: JSON.stringify(input) }, token),
  uploadAttachment: (token: string, type: FinancialTitleType, id: string, file: File) => { const body = new FormData(); body.append('file', file); return apiRequest(`/finance/titles/${type}/${id}/attachments`, { method: 'POST', body }, token); },
  createCostCenter: (token: string, input: unknown) => apiRequest<{ costCenter: CostCenter }>('/finance/cost-centers', { method: 'POST', body: JSON.stringify(input) }, token),
  createChartAccount: (token: string, input: unknown) => apiRequest<{ chartAccount: ChartAccount }>('/finance/chart-accounts', { method: 'POST', body: JSON.stringify(input) }, token),
  createBankAccount: (token: string, input: unknown) => apiRequest<{ bankAccount: BankAccount }>('/finance/bank-accounts', { method: 'POST', body: JSON.stringify(input) }, token),
  recurrences: async (token: string) => (await apiRequest<{ data: FinancialRecurrence[] }>('/finance/recurrences', {}, token)).data,
  createRecurrence: (token: string, input: unknown) => apiRequest('/finance/recurrences', { method: 'POST', body: JSON.stringify(input) }, token),
  recurrenceAction: (token: string, id: string, action: 'suspend' | 'reactivate' | 'close') => apiRequest(`/finance/recurrences/${id}/${action}`, { method: 'POST' }, token),
  processRecurrences: (token: string, throughDate: string) => apiRequest('/finance/recurrences/process', { method: 'POST', body: JSON.stringify({ throughDate }) }, token),
  movements: async (token: string, bankAccountId?: string) => (await apiRequest<{ data: BankMovement[] }>(`/finance/bank-movements?${query({ bankAccountId })}`, {}, token)).data,
  transactions: async (token: string, bankAccountId?: string) => (await apiRequest<{ data: BankTransaction[] }>(`/finance/bank-transactions?${query({ bankAccountId })}`, {}, token)).data,
  statementImports: (token: string) => apiRequest<{ data: Array<Record<string, unknown>> }>('/finance/statement-imports', {}, token),
  previewStatement: (token: string, bankAccountId: string, format: 'OFX' | 'CSV', file: File, mapping?: string) => { const body = new FormData(); body.append('bankAccountId', bankAccountId); body.append('format', format); if (mapping) body.append('mapping', mapping); body.append('file', file); return apiRequest<{ statementImport: Record<string, unknown> }>('/finance/statement-imports/preview', { method: 'POST', body }, token); },
  confirmStatement: (token: string, id: string) => apiRequest(`/finance/statement-imports/${id}/confirm`, { method: 'POST', body: JSON.stringify({}) }, token),
  reconcile: (token: string, links: Array<{ bankTransactionId: string; bankMovementId: string; amount: string }>, notes?: string) => apiRequest('/finance/reconciliations', { method: 'POST', body: JSON.stringify({ links, ...(notes ? { notes } : {}) }) }, token),
  transfer: (token: string, input: unknown) => apiRequest('/finance/bank-transfers', { method: 'POST', body: JSON.stringify(input) }, token),
};
