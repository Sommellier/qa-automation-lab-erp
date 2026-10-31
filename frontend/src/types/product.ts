export type ProductSortField = 'name' | 'sku' | 'price' | 'stock' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ManagedProduct {
  id: string; name: string; sku: string; description: string | null; price: string; stock: number;
  trackingMode: 'NONE' | 'LOT' | 'SERIAL' | 'LOT_AND_SERIAL'; expiryWarningDays: number; blockExpired: boolean; averageCost: string; stockValue: string;
  categoryId: string; category: { id: string; name: string; active: boolean }; active: boolean; createdAt: string; updatedAt: string;
}
export interface ListProductsParams {
  search?: string; categoryId?: string; active?: boolean; page: number; pageSize: number;
  sortBy: ProductSortField; sortOrder: SortOrder;
}
export interface PaginatedProducts {
  data: ManagedProduct[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface CreateProductInput {
  name: string; sku: string; description?: string; price: string; stock: number; categoryId: string; active: boolean;
}
export type UpdateProductInput = Omit<CreateProductInput, 'active' | 'stock'>;
