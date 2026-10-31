import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'qa_access_token';
export const REFRESH_COOKIE = 'qa_refresh_token';
export const CSRF_COOKIE = 'qa_csrf_token';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

function sharedCookieOptions(): Pick<CookieOptions, 'secure' | 'sameSite'> {
  return { secure: env.NODE_ENV === 'production', sameSite: 'lax' };
}

const accessCookieOptions = (): CookieOptions => ({
  ...sharedCookieOptions(),
  httpOnly: true,
  path: '/api',
  maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60_000,
});

const refreshCookieOptions = (): CookieOptions => ({
  ...sharedCookieOptions(),
  httpOnly: true,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_HOURS * 60 * 60_000,
});

const csrfCookieOptions = (): CookieOptions => ({
  ...sharedCookieOptions(),
  httpOnly: false,
  path: '/',
  maxAge: env.REFRESH_TOKEN_TTL_HOURS * 60 * 60_000,
});

export function requestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setSessionCookies(response: Response, session: SessionTokens): void {
  response.cookie(SESSION_COOKIE, session.accessToken, accessCookieOptions());
  response.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions());
  response.cookie(CSRF_COOKIE, session.csrfToken, csrfCookieOptions());
}

function clearOptions(options: CookieOptions): CookieOptions {
  const { maxAge: _maxAge, ...rest } = options;
  return rest;
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(SESSION_COOKIE, clearOptions(accessCookieOptions()));
  response.clearCookie(REFRESH_COOKIE, clearOptions(refreshCookieOptions()));
  response.clearCookie(CSRF_COOKIE, clearOptions(csrfCookieOptions()));
}
