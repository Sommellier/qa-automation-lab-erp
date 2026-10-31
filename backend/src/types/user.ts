import type { UserRole } from '@prisma/client';

export const USER_SORT_FIELDS = ['name', 'email', 'createdAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrivateProfileUser extends ManagedUser {
  passwordHash: string;
  tokenVersion: number;
}

export interface ListUsersInput {
  search?: string | undefined;
  role?: UserRole | undefined;
  active?: boolean | undefined;
  page: number;
  pageSize: number;
  sortBy: UserSortField;
  sortOrder: SortOrder;
}

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
}

export interface UpdateUserData {
  name?: string | undefined;
  email?: string | undefined;
  role?: UserRole | undefined;
  active?: boolean | undefined;
}
