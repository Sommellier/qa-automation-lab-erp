import type {
  CreateUserInput,
  ListUsersParams,
  ManagedUser,
  PaginatedUsers,
  UpdateUserInput,
} from '../types/user';
import { apiRequest } from './api';

function buildQuery(params: ListUsersParams): string {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  });

  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  if (params.active !== undefined) query.set('active', String(params.active));

  return query.toString();
}

export const usersApi = {
  list(token: string, params: ListUsersParams): Promise<PaginatedUsers> {
    return apiRequest<PaginatedUsers>(`/users?${buildQuery(params)}`, {}, token);
  },

  async getById(token: string, id: string): Promise<ManagedUser> {
    const response = await apiRequest<{ user: ManagedUser }>(`/users/${id}`, {}, token);
    return response.user;
  },

  async create(token: string, input: CreateUserInput): Promise<ManagedUser> {
    const response = await apiRequest<{ user: ManagedUser }>(
      '/users',
      { method: 'POST', body: JSON.stringify(input) },
      token,
    );
    return response.user;
  },

  async update(token: string, id: string, input: UpdateUserInput): Promise<ManagedUser> {
    const response = await apiRequest<{ user: ManagedUser }>(
      `/users/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      token,
    );
    return response.user;
  },

  async updateStatus(token: string, id: string, active: boolean): Promise<ManagedUser> {
    const response = await apiRequest<{ user: ManagedUser }>(
      `/users/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ active }) },
      token,
    );
    return response.user;
  },
};

