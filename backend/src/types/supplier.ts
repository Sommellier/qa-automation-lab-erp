export const SUPPLIER_SORT_FIELDS = ['name', 'email', 'document', 'createdAt'] as const;
export type SupplierSortField = (typeof SUPPLIER_SORT_FIELDS)[number];

export interface ManagedSupplier {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  contactName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListSuppliersInput {
  search?: string | undefined;
  active?: boolean | undefined;
  page: number;
  pageSize: number;
  sortBy: SupplierSortField;
  sortOrder: 'asc' | 'desc';
}
