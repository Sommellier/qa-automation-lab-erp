import { describe, expect, it } from 'vitest';
import { changePasswordSchema, updateProfileSchema } from './profile.schema.js';

describe('schemas de perfil', () => {
  it('aplica trim e as mesmas regras de nome da gestão de usuários', () => {
    expect(updateProfileSchema.parse({ name: '  Carlos da Silva  ' })).toEqual({ name: 'Carlos da Silva' });
    expect(updateProfileSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
  });

  it.each(['role', 'active', 'id', 'email'])('rejeita mass assignment do campo %s', (field) => {
    expect(updateProfileSchema.safeParse({ name: 'Carlos', [field]: 'valor' }).success).toBe(false);
  });

  it('exige confirmação idêntica', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Atual@123', newPassword: 'NovaSenha@123', confirmPassword: 'OutraSenha@123',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('A confirmação da nova senha não corresponde.');
  });

  it('aceita o contrato completo com senha forte', () => {
    expect(changePasswordSchema.safeParse({
      currentPassword: 'Atual@123', newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    }).success).toBe(true);
  });
});
