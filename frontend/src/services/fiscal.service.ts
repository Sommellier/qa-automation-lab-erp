import { apiDownload, apiRequest } from './api';
import type { FiscalAttachment, FiscalAttachmentType, FiscalCompany, FiscalDocument, FiscalImportBatch, FiscalLinksInput, FiscalOperation, FiscalProcessingStatus, FiscalStatus, PaginatedFiscalDocuments } from '../types/fiscal';

export interface ListFiscalParams { search?: string; operation?: FiscalOperation; fiscalStatus?: FiscalStatus; processingStatus?: FiscalProcessingStatus; supplierId?: string; clientId?: string; purchaseOrderId?: string; orderId?: string; dateFrom?: string; dateTo?: string; page: number; pageSize: number; sortOrder: 'asc' | 'desc' }
const query = (params: object) => { const value = new URLSearchParams(); Object.entries(params).forEach(([key, item]) => { if (item !== undefined && item !== '') value.set(key, String(item)); }); return value.toString(); };
export const fiscalApi = {
  list: (token: string, params: ListFiscalParams) => apiRequest<PaginatedFiscalDocuments>(`/fiscal/documents?${query(params)}`, {}, token),
  async getById(token: string, id: string) { return (await apiRequest<{ document: FiscalDocument }>(`/fiscal/documents/${id}`, {}, token)).document; },
  async companies(token: string) { return (await apiRequest<{ companies: FiscalCompany[] }>('/fiscal/companies', {}, token)).companies; },
  async createCompany(token: string, input: { legalName: string; taxId: string; active: boolean }) { return (await apiRequest<{ company: FiscalCompany }>('/fiscal/companies', { method: 'POST', body: JSON.stringify(input) }, token)).company; },
  async updateCompany(token: string, id: string, input: { legalName: string; taxId: string; active: boolean }) { return (await apiRequest<{ company: FiscalCompany }>(`/fiscal/companies/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).company; },
  async preview(token: string, files: File[]) { const form = new FormData(); files.forEach((file) => form.append('files', file)); return (await apiRequest<{ batch: FiscalImportBatch }>('/fiscal/imports/preview', { method: 'POST', body: form }, token)).batch; },
  async getBatch(token: string, id: string) { return (await apiRequest<{ batch: FiscalImportBatch }>(`/fiscal/imports/${id}`, {}, token)).batch; },
  confirm: (token: string, batchId: string, input: { companyId: string; documents: Array<{ fileId: string; operation: FiscalOperation; links: FiscalLinksInput }> }) => apiRequest<{ batchId: string; imported: number; documentIds: string[] }>(`/fiscal/imports/${batchId}/confirm`, { method: 'POST', body: JSON.stringify(input) }, token),
  async updateLinks(token: string, id: string, input: FiscalLinksInput) { return (await apiRequest<{ document: FiscalDocument }>(`/fiscal/documents/${id}/links`, { method: 'PATCH', body: JSON.stringify(input) }, token)).document; },
  async addAttachment(token: string, id: string, file: File, type: Exclude<FiscalAttachmentType, 'ORIGINAL_XML'>) { const form = new FormData(); form.append('file', file); form.append('type', type); return (await apiRequest<{ attachment: FiscalAttachment }>(`/fiscal/documents/${id}/attachments`, { method: 'POST', body: form }, token)).attachment; },
  downloadAttachment: (token: string, id: string, attachmentId: string) => apiDownload(`/fiscal/documents/${id}/attachments/${attachmentId}/download`, token),
  removeAttachment: (token: string, id: string, attachmentId: string) => apiRequest(`/fiscal/documents/${id}/attachments/${attachmentId}`, { method: 'DELETE' }, token),
};
