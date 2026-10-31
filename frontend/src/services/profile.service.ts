import type { User } from '../types/auth';
import type { ChangePasswordInput, UpdateProfileInput } from '../types/profile';
import { apiRequest } from './api';

export const profileApi = {
  async update(token: string, input: UpdateProfileInput): Promise<User> {
    const response = await apiRequest<{ user: User }>('/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }, token);
    return response.user;
  },

  changePassword(token: string, input: ChangePasswordInput): Promise<void> {
    return apiRequest<void>('/profile/password', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }, token);
  },
};
