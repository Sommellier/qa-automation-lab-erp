import type { PurchaseApprovalStatus, PurchaseOrderStatus } from '@prisma/client';

export const PURCHASE_SORT_FIELDS = ['number', 'total', 'status', 'createdAt', 'expectedAt'] as const;
export type PurchaseSortField = (typeof PURCHASE_SORT_FIELDS)[number];

export interface ListPurchasesInput {
  search?: string | undefined;
  status?: PurchaseOrderStatus | undefined;
  approvalStatus?: PurchaseApprovalStatus | undefined;
  supplierId?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  page: number;
  pageSize: number;
  sortBy: PurchaseSortField;
  sortOrder: 'asc' | 'desc';
}
