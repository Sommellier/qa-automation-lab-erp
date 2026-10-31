import type { ListAuditParams, PaginatedAuditLogs } from '../types/audit';
import { apiRequest } from './api';

function buildQuery(params: ListAuditParams): string {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortOrder: params.sortOrder,
  });
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.action) query.set('action', params.action);
  if (params.userId) query.set('userId', params.userId);
  if (params.entityId) query.set('entityId', params.entityId);
  if (params.search) query.set('search', params.search);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  return query.toString();
}

export const auditApi = {
  list(token: string, params: ListAuditParams): Promise<PaginatedAuditLogs> {
    return apiRequest<PaginatedAuditLogs>(`/audit?${buildQuery(params)}`, {}, token);
  },
};
