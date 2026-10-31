export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'price', 'stock', 'createdAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export interface ManagedProduct {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: { toJSON(): string; toString(): string };
  stock: number;
  trackingMode: 'NONE' | 'LOT' | 'SERIAL' | 'LOT_AND_SERIAL';
  expiryWarningDays: number;
  blockExpired: boolean;
  averageCost: { toJSON(): string; toString(): string };
  stockValue: { toJSON(): string; toString(): string };
  categoryId: string;
  category: { id: string; name: string; active: boolean };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListProductsInput {
  search?: string | undefined;
  categoryId?: string | undefined;
  active?: boolean | undefined;
  page: number;
  pageSize: number;
  sortBy: ProductSortField;
  sortOrder: SortOrder;
}

export interface CreateProductData {
  name: string;
  sku: string;
  description?: string | undefined;
  price: string;
  stock: number;
  categoryId: string;
  active: boolean;
}

export interface UpdateProductData {
  name?: string | undefined;
  sku?: string | undefined;
  description?: string | null | undefined;
  price?: string | undefined;
  categoryId?: string | undefined;
}
