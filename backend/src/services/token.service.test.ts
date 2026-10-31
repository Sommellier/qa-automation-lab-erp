import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { createAccessToken, createRefreshToken, verifyAccessToken, verifyRefreshToken } from './token.service.js';

describe('token service', () => {
  it('cria e valida um token de acesso', () => {
    const token = createAccessToken('user-1', UserRole.ADMIN);

    expect(verifyAccessToken(token)).toEqual({
      userId: 'user-1',
      role: UserRole.ADMIN,
      tokenVersion: 0,
    });
  });

  it('trata token inválido', () => {
    expect(() => verifyAccessToken('token-invalido')).toThrowError(
      expect.objectContaining({ code: 'INVALID_TOKEN', statusCode: 401 }),
    );
  });

  it('trata token expirado', () => {
    const expiredToken = jwt.sign({ role: UserRole.ADMIN, tokenVersion: 0, kind: 'access' }, env.JWT_SECRET, {
      subject: 'user-1',
      expiresIn: -1,
    });

    expect(() => verifyAccessToken(expiredToken)).toThrowError(
      expect.objectContaining({ code: 'TOKEN_EXPIRED', statusCode: 401 }),
    );
  });

  it('recusa um perfil fora do enum', () => {
    const token = jwt.sign({ role: 'SUPER_ADMIN', tokenVersion: 0, kind: 'access' }, env.JWT_SECRET, {
      subject: 'user-1',
      expiresIn: '1h',
    });

    expect(() => verifyAccessToken(token)).toThrowError(
      expect.objectContaining({ code: 'INVALID_TOKEN', statusCode: 401 }),
    );
  });

  it('separa tokens de acesso e renovação', () => {
    const refreshToken = createRefreshToken('user-1', UserRole.ANALISTA, 3);

    expect(verifyRefreshToken(refreshToken)).toEqual({
      userId: 'user-1',
      role: UserRole.ANALISTA,
      tokenVersion: 3,
    });
    expect(() => verifyAccessToken(refreshToken)).toThrowError(
      expect.objectContaining({ code: 'INVALID_TOKEN', statusCode: 401 }),
    );
  });
});

