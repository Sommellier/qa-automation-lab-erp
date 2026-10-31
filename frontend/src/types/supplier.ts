export interface Supplier {
  id: string; name: string; document: string; email: string; phone: string | null;
  contactName: string | null; active: boolean; createdAt: string; updatedAt: string;
}
export interface SupplierInput { name: string; document: string; email: string; phone?: string | null; contactName?: string | null; active: boolean }
export interface ListSuppliersParams { search?: string; active?: boolean; page: number; pageSize: number; sortBy: 'name' | 'email' | 'document' | 'createdAt'; sortOrder: 'asc' | 'desc' }
export interface PaginatedSuppliers { data: Supplier[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
