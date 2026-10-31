import { describe, expect, it } from 'vitest';
import { PASSWORD_POLICY, passwordSchema } from './password.schema.js';

describe('passwordSchema', () => {
  it('aceita uma senha que cumpre toda a política centralizada', () => {
    expect(PASSWORD_POLICY.minLength).toBe(8);
    expect(passwordSchema.safeParse('NovaSenha@123').success).toBe(true);
  });

  it.each([
    ['Curta@1', '8 caracteres'],
    ['novasenha@123', 'maiúscula'],
    ['NOVASENHA@123', 'minúscula'],
    ['NovaSenha@abc', 'número'],
    ['NovaSenha123', 'especial'],
  ])('rejeita %s quando falta o requisito %s', (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });
});
