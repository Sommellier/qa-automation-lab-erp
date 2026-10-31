import type { ReceivableStatus } from '@prisma/client';

export const RECEIVABLE_EFFECTIVE_STATUSES = ['DRAFT', 'PENDING', 'PARTIALLY_RECEIVED', 'RECEIVED', 'OVERDUE', 'CANCELLED'] as const;
export type EffectiveReceivableStatus = (typeof RECEIVABLE_EFFECTIVE_STATUSES)[number];
export const RECEIVABLE_SORT_FIELDS = ['number', 'dueDate', 'originalAmount', 'receivedAmount', 'status', 'createdAt'] as const;
export type ReceivableSortField = (typeof RECEIVABLE_SORT_FIELDS)[number];

export interface ListReceivablesInput {
  search?: string | undefined;
  status?: EffectiveReceivableStatus | undefined;
  clientId?: string | undefined;
  dueFrom?: Date | undefined;
  dueTo?: Date | undefined;
  page: number;
  pageSize: number;
  sortBy: ReceivableSortField;
  sortOrder: 'asc' | 'desc';
}

export function effectiveReceivableStatus(status: ReceivableStatus, dueDate: Date, today: Date): EffectiveReceivableStatus {
  if ((status === 'PENDING' || status === 'PARTIALLY_RECEIVED') && dueDate < today) return 'OVERDUE';
  return status;
}
