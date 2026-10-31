import type { UserRole } from './auth';

export type UserSortField = 'name' | 'email' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersParams {
  search?: string;
  role?: UserRole;
  active?: boolean;
  page: number;
  pageSize: number;
  sortBy: UserSortField;
  sortOrder: SortOrder;
}

export interface PaginatedUsers {
  data: ManagedUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  active: boolean;
}

export interface UpdateUserInput {
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

