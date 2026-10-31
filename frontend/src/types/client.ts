export type ClientSortField = 'name' | 'email' | 'document' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export interface ManagedClient {
  id: string;
  name: string;
  document: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListClientsParams {
  search?: string;
  active?: boolean;
  page: number;
  pageSize: number;
  sortBy: ClientSortField;
  sortOrder: SortOrder;
}

export interface PaginatedClients {
  data: ManagedClient[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateClientInput {
  name: string;
  document: string;
  email: string;
  phone?: string;
  active: boolean;
}

export interface UpdateClientInput {
  name?: string;
  document?: string;
  email?: string;
  phone?: string | null;
}

export type AddressType = 'RESIDENTIAL' | 'COMMERCIAL' | 'BILLING' | 'OTHER';
export type AddressSortField = 'createdAt' | 'type' | 'city';

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCIAL: 'Comercial',
  BILLING: 'Cobrança',
  OTHER: 'Outro',
};

export interface ClientAddress {
  id: string;
  clientId: string;
  type: AddressType;
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListClientAddressesParams {
  active?: boolean;
  type?: AddressType;
  page: number;
  pageSize: number;
  sortBy: AddressSortField;
  sortOrder: SortOrder;
}

export interface PaginatedClientAddresses {
  data: ClientAddress[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ClientAddressInput {
  type: AddressType;
  zipCode: string;
  street: string;
  number: string;
  complement?: string | null;
  district: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
}
