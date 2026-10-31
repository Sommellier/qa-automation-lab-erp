import { describe, expect, it } from 'vitest';
import { createCsrfToken, verifyCsrfToken } from './csrf.service.js';

describe('proteção CSRF', () => {
  it('aceita somente o par cookie/cabeçalho assinado e vinculado ao usuário', () => {
    const token = createCsrfToken('user-1');

    expect(() => verifyCsrfToken(token, token, 'user-1')).not.toThrow();
    expect(() => verifyCsrfToken(token, token, 'user-2')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CSRF_TOKEN', statusCode: 403 }),
    );
    expect(() => verifyCsrfToken(token, undefined, 'user-1')).toThrowError(
      expect.objectContaining({ code: 'INVALID_CSRF_TOKEN', statusCode: 403 }),
    );
  });
});
