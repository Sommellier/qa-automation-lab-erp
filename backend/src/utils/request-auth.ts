import { AppError } from '../errors/app-error.js';
import type { AuthenticatedUser } from '../types/auth.js';

export function authenticatedUserId(request: { auth?: AuthenticatedUser }): string {
  if (!request.auth) throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
  return request.auth.userId;
}
