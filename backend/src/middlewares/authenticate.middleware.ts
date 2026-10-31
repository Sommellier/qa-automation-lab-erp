import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { PrismaUserRepository } from '../repositories/user.repository.js';
import { verifyAccessToken } from '../services/token.service.js';
import { verifyCsrfToken } from '../services/csrf.service.js';
import { CSRF_COOKIE, requestCookie, SESSION_COOKIE } from '../utils/session-cookie.js';

const users = new PrismaUserRepository();

export async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> {
  const authorization = request.headers.authorization;
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : undefined;
  const cookieToken = requestCookie(request, SESSION_COOKIE);
  const token = bearerToken || cookieToken;
  const authenticatedByCookie = !bearerToken && Boolean(cookieToken);

  if (!token) {
    throw new AppError('Token de autenticação não informado.', 401, 'MISSING_TOKEN');
  }

  const tokenUser = verifyAccessToken(token);
  const currentUser = await users.findActiveById(tokenUser.userId);

  if (!currentUser || !currentUser.active) {
    throw new AppError('Usuário não encontrado ou inativo.', 401, 'USER_UNAVAILABLE');
  }

  if ((currentUser.tokenVersion ?? 0) !== tokenUser.tokenVersion) {
    throw new AppError('Sessão inválida. Entre novamente.', 401, 'SESSION_INVALIDATED');
  }

  if (authenticatedByCookie && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    verifyCsrfToken(requestCookie(request, CSRF_COOKIE), request.get('x-csrf-token'), currentUser.id);
  }

  request.auth = { userId: currentUser.id, role: currentUser.role, tokenVersion: currentUser.tokenVersion ?? 0 };
  next();
}
