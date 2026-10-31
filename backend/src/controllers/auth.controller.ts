import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import type { LoginInput } from '../schemas/auth.schema.js';
import type { AuthService } from '../services/auth.service.js';
import { noopAbuseProtection, type AbuseProtection } from '../services/security-throttle.service.js';
import { getClientIp } from '../utils/client-ip.js';
import { clearSessionCookies, CSRF_COOKIE, REFRESH_COOKIE, requestCookie, setSessionCookies } from '../utils/session-cookie.js';
import { verifyCsrfToken } from '../services/csrf.service.js';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly abuse: AbuseProtection = noopAbuseProtection,
  ) {}

  login = async (request: Request<unknown, unknown, LoginInput>, response: Response): Promise<void> => {
    const subjects = { ip: getClientIp(request), account: request.body.email };
    await this.abuse.assertAllowed('LOGIN', subjects);
    let result;
    try {
      result = await this.authService.login(request.body);
    } catch (error: unknown) {
      if (error instanceof AppError && error.code === 'INVALID_CREDENTIALS') {
        await this.abuse.recordFailure('LOGIN', subjects, error.code);
      }
      throw error;
    }
    await this.abuse.clearAccount('LOGIN', request.body.email);
    setSessionCookies(response, result.session);
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ user: result.user });
  };

  refresh = async (request: Request, response: Response): Promise<void> => {
    const refreshToken = requestCookie(request, REFRESH_COOKIE);
    if (!refreshToken) {
      clearSessionCookies(response);
      throw new AppError('Sessão expirada.', 401, 'MISSING_REFRESH_TOKEN');
    }

    let result;
    try {
      result = await this.authService.refresh(refreshToken);
    } catch (error: unknown) {
      if (error instanceof AppError && error.statusCode === 401) clearSessionCookies(response);
      throw error;
    }
    verifyCsrfToken(
      requestCookie(request, CSRF_COOKIE),
      request.get('x-csrf-token'),
      result.user.id,
    );
    setSessionCookies(response, result.session);
    response.setHeader('Cache-Control', 'no-store');
    response.status(204).send();
  };

  me = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) {
      throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
    }

    const user = await this.authService.me(request.auth.userId);
    response.status(200).json({ user });
  };

  logout = async (_request: Request, response: Response): Promise<void> => {
    clearSessionCookies(response);
    response.setHeader('Cache-Control', 'no-store');
    response.status(204).send();
  };
}

