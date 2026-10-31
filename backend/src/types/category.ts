export const CATEGORY_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type CategorySortField = (typeof CATEGORY_SORT_FIELDS)[number];

export interface ManagedCategory {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryOption {
  id: string;
  name: string;
  active?: boolean;
}

export interface ListCategoriesInput {
  search?: string | undefined;
  active?: boolean | undefined;
  page: number;
  pageSize: number;
  sortBy: CategorySortField;
  sortOrder: 'asc' | 'desc';
}

export interface CreateCategoryData {
  name: string;
  normalizedName: string;
  description?: string | undefined;
  active: boolean;
}

export interface UpdateCategoryData {
  name?: string | undefined;
  normalizedName?: string | undefined;
  description?: string | null | undefined;
  active?: boolean | undefined;
}
