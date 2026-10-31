import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';

function signature(userId: string, nonce: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`${userId}.${nonce}`).digest('base64url');
}

export function createCsrfToken(userId: string): string {
  const nonce = randomBytes(32).toString('base64url');
  return `${nonce}.${signature(userId, nonce)}`;
}

export function verifyCsrfToken(cookieToken: string | undefined, headerToken: string | undefined, userId: string): void {
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new AppError('Token CSRF ausente ou inválido.', 403, 'INVALID_CSRF_TOKEN');
  }

  const [nonce, receivedSignature, extra] = cookieToken.split('.');
  if (!nonce || !receivedSignature || extra || !/^[A-Za-z0-9_-]+$/.test(nonce)) {
    throw new AppError('Token CSRF ausente ou inválido.', 403, 'INVALID_CSRF_TOKEN');
  }

  const expected = Buffer.from(signature(userId, nonce));
  const received = Buffer.from(receivedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError('Token CSRF ausente ou inválido.', 403, 'INVALID_CSRF_TOKEN');
  }
}
