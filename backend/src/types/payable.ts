import type { PayableStatus } from '@prisma/client';

export const PAYABLE_EFFECTIVE_STATUSES = ['DRAFT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
export type EffectivePayableStatus = (typeof PAYABLE_EFFECTIVE_STATUSES)[number];
export const PAYABLE_SORT_FIELDS = ['number', 'dueDate', 'originalAmount', 'paidAmount', 'status', 'createdAt'] as const;
export type PayableSortField = (typeof PAYABLE_SORT_FIELDS)[number];

export interface ListPayablesInput {
  search?: string | undefined;
  status?: EffectivePayableStatus | undefined;
  supplierId?: string | undefined;
  dueFrom?: Date | undefined;
  dueTo?: Date | undefined;
  page: number;
  pageSize: number;
  sortBy: PayableSortField;
  sortOrder: 'asc' | 'desc';
}

export function effectivePayableStatus(status: PayableStatus, dueDate: Date, today: Date): EffectivePayableStatus {
  if ((status === 'PENDING' || status === 'PARTIALLY_PAID') && dueDate < today) return 'OVERDUE';
  return status;
}
