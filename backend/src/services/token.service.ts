import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { AuthenticatedUser } from '../types/auth.js';

interface AccessTokenPayload extends JwtPayload {
  role?: UserRole;
  tokenVersion?: number;
  kind?: 'access' | 'refresh';
}

export function createAccessToken(userId: string, role: UserRole, tokenVersion = 0): string {
  const options: SignOptions = {
    subject: userId,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    jwtid: randomUUID(),
  };

  return jwt.sign({ role, tokenVersion, kind: 'access' }, env.JWT_SECRET, options);
}

export function createRefreshToken(userId: string, role: UserRole, tokenVersion = 0): string {
  const options: SignOptions = {
    subject: userId,
    expiresIn: `${env.REFRESH_TOKEN_TTL_HOURS}h`,
    jwtid: randomUUID(),
  };

  return jwt.sign({ role, tokenVersion, kind: 'refresh' }, env.JWT_SECRET, options);
}

function verifyToken(token: string, expectedKind: 'access' | 'refresh'): AuthenticatedUser {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

    if (!payload.sub || !payload.role || !Object.values(UserRole).includes(payload.role)
      || !Number.isInteger(payload.tokenVersion) || payload.tokenVersion! < 0 || payload.kind !== expectedKind) {
      throw new AppError('Token inválido.', 401, 'INVALID_TOKEN');
    }

    return { userId: payload.sub, role: payload.role, tokenVersion: payload.tokenVersion! };
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(
        'Sessão expirada.',
        401,
        expectedKind === 'refresh' ? 'SESSION_EXPIRED' : 'TOKEN_EXPIRED',
      );
    }

    throw new AppError('Token inválido.', 401, 'INVALID_TOKEN');
  }
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  return verifyToken(token, 'access');
}

export function verifyRefreshToken(token: string): AuthenticatedUser {
  return verifyToken(token, 'refresh');
}
