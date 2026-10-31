export type CategorySortField = 'name' | 'createdAt' | 'updatedAt';
export interface ManagedCategory { id: string; name: string; description: string | null; active: boolean; productCount: number; createdAt: string; updatedAt: string }
export interface CategoryOption { id: string; name: string; active?: boolean }
export interface ListCategoriesParams { search?: string; active?: boolean; page: number; pageSize: number; sortBy: CategorySortField; sortOrder: 'asc' | 'desc' }
export interface PaginatedCategories { data: ManagedCategory[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface CreateCategoryInput { name: string; description?: string; active: boolean }
export interface UpdateCategoryInput { name: string; description?: string | null }
