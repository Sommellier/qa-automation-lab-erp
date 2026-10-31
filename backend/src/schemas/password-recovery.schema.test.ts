import { describe, expect, it } from 'vitest';
import { forgotPasswordSchema, resetPasswordSchema } from './password-recovery.schema.js';

describe('schemas de recuperação de senha', () => {
  it('normaliza o e-mail e rejeita campos adicionais', () => {
    expect(forgotPasswordSchema.parse({ email: '  Pessoa@Empresa.COM  ' })).toEqual({ email: 'pessoa@empresa.com' });
    expect(forgotPasswordSchema.safeParse({ email: 'pessoa@empresa.com', active: true }).success).toBe(false);
  });

  it('aplica a política de senha e exige confirmação idêntica', () => {
    expect(resetPasswordSchema.safeParse({
      token: 'a'.repeat(43), newPassword: 'fraca', confirmPassword: 'fraca',
    }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({
      token: 'a'.repeat(43), newPassword: 'NovaSenha@123', confirmPassword: 'OutraSenha@123',
    }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({
      token: 'a'.repeat(43), newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    }).success).toBe(true);
  });
});
