import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.auth) {
      throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
    }

    if (!allowedRoles.includes(request.auth.role)) {
      throw new AppError('Você não possui permissão para acessar este recurso.', 403, 'FORBIDDEN');
    }

    next();
  };
}

