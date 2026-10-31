import type { AddressType } from '@prisma/client';

export const ADDRESS_SORT_FIELDS = ['createdAt', 'type', 'city'] as const;
export type AddressSortField = (typeof ADDRESS_SORT_FIELDS)[number];

export interface ManagedClientAddress {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ListClientAddressesInput {
  active?: boolean | undefined;
  type?: AddressType | undefined;
  page: number;
  pageSize: number;
  sortBy: AddressSortField;
  sortOrder: 'asc' | 'desc';
}

export interface CreateClientAddressData {
  clientId: string;
  type: AddressType;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
  active: boolean;
}

export interface UpdateClientAddressData {
  type?: AddressType | undefined;
  zipCode?: string | undefined;
  street?: string | undefined;
  number?: string | undefined;
  complement?: string | null | undefined;
  district?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  country?: string | undefined;
  isPrimary?: boolean | undefined;
  active?: boolean | undefined;
}
