import type { CommissionReport, CommissionRuleView, ManagedQuote, QuoteApprovalRule, QuoteInput, QuoteListResponse, QuoteSetup, QuoteStatus } from '../types/quote';
import type { UserRole } from '../types/auth';
import { apiRequest } from './api';

export const quotesApi = {
  setup(token: string): Promise<QuoteSetup> { return apiRequest('/quotes/setup', {}, token); },
  list(token: string, params: { search?: string; status?: QuoteStatus; page?: number; pageSize?: number }): Promise<QuoteListResponse> {
    const query = new URLSearchParams({ page: String(params.page ?? 1), pageSize: String(params.pageSize ?? 20), sortOrder: 'desc' });
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    return apiRequest(`/quotes?${query}`, {}, token);
  },
  async get(token: string, id: string): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>(`/quotes/${id}`, {}, token)).quote; },
  async create(token: string, input: QuoteInput): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>('/quotes', { method: 'POST', body: JSON.stringify(input) }, token)).quote; },
  async update(token: string, id: string, input: QuoteInput): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(input) }, token)).quote; },
  async action(token: string, id: string, action: 'submit' | 'approve' | 'cancel', comment?: string): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>(`/quotes/${id}/${action}`, { method: 'POST', body: JSON.stringify(comment ? { comment } : {}) }, token)).quote; },
  async reject(token: string, id: string, reason: string): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>(`/quotes/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, token)).quote; },
  async renew(token: string, id: string, reservationHours?: number): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>(`/quotes/${id}/reservations/renew`, { method: 'POST', body: JSON.stringify(reservationHours ? { reservationHours } : {}) }, token)).quote; },
  async note(token: string, id: string, comment: string): Promise<ManagedQuote> { return (await apiRequest<{ quote: ManagedQuote }>(`/quotes/${id}/notes`, { method: 'POST', body: JSON.stringify({ comment }) }, token)).quote; },
  async convert(token: string, id: string): Promise<{ id: string; number: string }> { return (await apiRequest<{ order: { id: string; number: string } }>(`/quotes/${id}/convert`, { method: 'POST' }, token)).order; },
  approvalRules(token: string): Promise<{ rules: QuoteApprovalRule[] }> { return apiRequest('/quotes/approval-rules', {}, token); },
  async updateApprovalRule(token: string, role: UserRole, input: { maxDiscountPercent: number; active: boolean }): Promise<QuoteApprovalRule> { return (await apiRequest<{ rule: QuoteApprovalRule }>(`/quotes/approval-rules/${role}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).rule; },
  commissionRules(token: string): Promise<{ rules: CommissionRuleView[] }> { return apiRequest('/quotes/commission-rules', {}, token); },
  async updateCommissionRule(token: string, userId: string, input: { rate: number; active: boolean }): Promise<void> { await apiRequest(`/quotes/commission-rules/${userId}`, { method: 'PATCH', body: JSON.stringify(input) }, token); },
  commissions(token: string): Promise<CommissionReport> { return apiRequest('/quotes/commissions', {}, token); },
};
