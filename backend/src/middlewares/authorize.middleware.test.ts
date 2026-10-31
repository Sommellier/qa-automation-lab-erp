import { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { authorizeRoles } from './authorize.middleware.js';

describe('authorizeRoles', () => {
  const response = {} as Response;

  it('permite um dos perfis configurados', () => {
    const request = {
      auth: { userId: 'user-1', role: UserRole.ADMIN },
    } as unknown as Request;
    const next = vi.fn() as NextFunction;

    authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA)(request, response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('retorna forbidden para um perfil não permitido', () => {
    const request = {
      auth: { userId: 'user-1', role: UserRole.VISUALIZADOR },
    } as unknown as Request;
    const next = vi.fn() as NextFunction;

    expect(() => authorizeRoles(UserRole.ADMIN)(request, response, next)).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

