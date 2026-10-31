import type { ForgotPasswordInput, LoginCredentials, LoginResponse, ResetPasswordInput, User } from '../types/auth';
import { apiRequest } from './api';

export const authApi = {
  login(credentials: LoginCredentials): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  async me(sessionMarker?: string): Promise<User> {
    const response = await apiRequest<{ user: User }>('/auth/me', {}, sessionMarker);
    return response.user;
  },

  logout(sessionMarker?: string): Promise<void> {
    return apiRequest<void>('/auth/logout', { method: 'POST' }, sessionMarker);
  },

  forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  resetPassword(input: ResetPasswordInput): Promise<void> {
    return apiRequest<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

