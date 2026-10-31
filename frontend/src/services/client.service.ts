import type {
  CreateClientInput,
  ListClientsParams,
  ManagedClient,
  PaginatedClients,
  UpdateClientInput,
  ClientAddress,
  ClientAddressInput,
  ListClientAddressesParams,
  PaginatedClientAddresses,
} from '../types/client';
import { apiRequest } from './api';

function buildQuery(params: ListClientsParams): string {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });
  if (params.search) query.set('search', params.search);
  if (params.active !== undefined) query.set('active', String(params.active));
  return query.toString();
}

export const clientsApi = {
  list(token: string, params: ListClientsParams): Promise<PaginatedClients> {
    return apiRequest<PaginatedClients>(`/clients?${buildQuery(params)}`, {}, token);
  },

  async getById(token: string, id: string): Promise<ManagedClient> {
    const response = await apiRequest<{ client: ManagedClient }>(`/clients/${id}`, {}, token);
    return response.client;
  },

  async create(token: string, input: CreateClientInput): Promise<ManagedClient> {
    const response = await apiRequest<{ client: ManagedClient }>(
      '/clients',
      { method: 'POST', body: JSON.stringify(input) },
      token,
    );
    return response.client;
  },

  async update(token: string, id: string, input: UpdateClientInput): Promise<ManagedClient> {
    const response = await apiRequest<{ client: ManagedClient }>(
      `/clients/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      token,
    );
    return response.client;
  },

  async updateStatus(token: string, id: string, active: boolean): Promise<ManagedClient> {
    const response = await apiRequest<{ client: ManagedClient }>(
      `/clients/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ active }) },
      token,
    );
    return response.client;
  },

  listAddresses(token: string, clientId: string, params: ListClientAddressesParams): Promise<PaginatedClientAddresses> {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), sortBy: params.sortBy, sortOrder: params.sortOrder });
    if (params.active !== undefined) query.set('active', String(params.active));
    if (params.type) query.set('type', params.type);
    return apiRequest<PaginatedClientAddresses>(`/clients/${clientId}/addresses?${query}`, {}, token);
  },

  async getAddress(token: string, clientId: string, addressId: string): Promise<ClientAddress> {
    return (await apiRequest<{ address: ClientAddress }>(`/clients/${clientId}/addresses/${addressId}`, {}, token)).address;
  },

  async createAddress(token: string, clientId: string, input: ClientAddressInput): Promise<ClientAddress> {
    return (await apiRequest<{ address: ClientAddress }>(`/clients/${clientId}/addresses`, { method: 'POST', body: JSON.stringify(input) }, token)).address;
  },

  async updateAddress(token: string, clientId: string, addressId: string, input: Partial<ClientAddressInput>): Promise<ClientAddress> {
    return (await apiRequest<{ address: ClientAddress }>(`/clients/${clientId}/addresses/${addressId}`, { method: 'PATCH', body: JSON.stringify(input) }, token)).address;
  },

  async updateAddressStatus(token: string, clientId: string, addressId: string, active: boolean): Promise<ClientAddress> {
    return (await apiRequest<{ address: ClientAddress }>(`/clients/${clientId}/addresses/${addressId}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }, token)).address;
  },

  async setPrimaryAddress(token: string, clientId: string, addressId: string): Promise<ClientAddress> {
    return (await apiRequest<{ address: ClientAddress }>(`/clients/${clientId}/addresses/${addressId}/primary`, { method: 'PATCH' }, token)).address;
  },
};
