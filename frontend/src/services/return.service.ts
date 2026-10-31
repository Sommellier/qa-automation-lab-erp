import type { PaginatedReturns, ReturnFinancialAdjustmentType, ReturnItemCondition, ReturnProcess, ReturnReason, ReturnStatus, ReturnType } from '../types/return';
import { apiDownload, apiRequest } from './api';

const query = (params: object) => { const value = new URLSearchParams(); Object.entries(params).forEach(([key, item]) => { if (item !== undefined && item !== '') value.set(key, String(item)); }); return value.toString(); };
export interface ListReturnsParams { search?: string; type?: ReturnType; status?: ReturnStatus; supplierId?: string; clientId?: string; productId?: string; dateFrom?: string; dateTo?: string; page: number; pageSize: number; sortOrder: 'asc' | 'desc' }
export interface CreateReturnInput { type: ReturnType; purchaseReceiptId?: string; orderId?: string; reasonId: string; justification?: string; notes?: string; financialTreatment?: ReturnFinancialAdjustmentType; payableId?: string; receivableId?: string; items: Array<{ sourceItemId: string; quantity: number; replacementProductId?: string; replacementQuantity?: number }> }

export const returnsApi = {
  list: (token: string, params: ListReturnsParams) => apiRequest<PaginatedReturns>(`/returns?${query(params)}`, {}, token),
  async getById(token: string, id: string) { return (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}`, {}, token)).returnProcess; },
  async create(token: string, input: CreateReturnInput) { return (await apiRequest<{ returnProcess: ReturnProcess }>('/returns', { method: 'POST', body: JSON.stringify(input) }, token)).returnProcess; },
  async reasons(token: string, includeInactive = false) { return (await apiRequest<{ reasons: ReturnReason[] }>(`/returns/reasons${includeInactive ? '?includeInactive=true' : ''}`, {}, token)).reasons; },
  transition: async (token: string, id: string, action: 'submit' | 'review' | 'approve' | 'cancel', comment?: string) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/${action}`, { method: 'POST', body: JSON.stringify(comment ? { comment } : {}) }, token)).returnProcess,
  reject: async (token: string, id: string, comment: string) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }, token)).returnProcess,
  confirmPhysical: async (token: string, id: string, items: Array<{ itemId: string; condition: ReturnItemCondition }>, comment?: string) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/physical-confirmation`, { method: 'POST', body: JSON.stringify({ items, ...(comment ? { comment } : {}) }) }, token)).returnProcess,
  inspect: async (token: string, id: string, itemId: string, condition: Exclude<ReturnItemCondition, 'NOT_APPLICABLE' | 'PENDING_INSPECTION'>, comment?: string) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/items/${itemId}/inspection`, { method: 'POST', body: JSON.stringify({ condition, ...(comment ? { comment } : {}) }) }, token)).returnProcess,
  linkAdjustment: async (token: string, id: string, adjustmentId: string, input: { payableId?: string | null; receivableId?: string | null; notes?: string | null }) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/financial-adjustments/${adjustmentId}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).returnProcess,
  approveAdjustment: async (token: string, id: string, adjustmentId: string) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/financial-adjustments/${adjustmentId}/approve`, { method: 'POST' }, token)).returnProcess,
  settleAdjustment: async (token: string, id: string, adjustmentId: string, settlementReference: string) => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/financial-adjustments/${adjustmentId}/settle`, { method: 'POST', body: JSON.stringify({ settlementReference }) }, token)).returnProcess,
  linkFiscal: async (token: string, id: string, fiscalDocumentId: string, role: 'ORIGINAL' | 'RETURN_DOCUMENT') => (await apiRequest<{ returnProcess: ReturnProcess }>(`/returns/${id}/fiscal-links`, { method: 'POST', body: JSON.stringify({ fiscalDocumentId, role }) }, token)).returnProcess,
  async addAttachment(token: string, id: string, file: File, type: 'RECEIPT' | 'PHOTO' | 'TECHNICAL_REPORT' | 'OTHER') { const body = new FormData(); body.append('file', file); body.append('type', type); return apiRequest(`/returns/${id}/attachments`, { method: 'POST', body }, token); },
  downloadAttachment: (token: string, id: string, attachmentId: string) => apiDownload(`/returns/${id}/attachments/${attachmentId}/download`, token),
  removeAttachment: (token: string, id: string, attachmentId: string) => apiRequest(`/returns/${id}/attachments/${attachmentId}`, { method: 'DELETE' }, token),
};
