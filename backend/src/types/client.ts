export const CLIENT_SORT_FIELDS = ['name', 'email', 'document', 'createdAt'] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export interface ManagedClient {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListClientsInput {
  search?: string | undefined;
  active?: boolean | undefined;
  page: number;
  pageSize: number;
  sortBy: ClientSortField;
  sortOrder: SortOrder;
}

export interface CreateClientData {
  name: string;
  document: string;
  email: string;
  phone?: string | undefined;
  active: boolean;
}

export interface UpdateClientData {
  name?: string | undefined;
  document?: string | undefined;
  email?: string | undefined;
  phone?: string | null | undefined;
}
