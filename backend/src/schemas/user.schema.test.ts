import { describe, expect, it } from 'vitest';
import { createUserSchema, listUsersQuerySchema, userIdSchema } from './user.schema.js';

describe('schemas de usuário', () => {
  it('rejeita ID que não seja UUID', () => {
    expect(userIdSchema.safeParse('id-invalido').success).toBe(false);
  });

  it('rejeita perfil inválido na criação', () => {
    const result = createUserSchema.safeParse({
      name: 'Usuário',
      email: 'usuario@empresa.com',
      password: 'Senha@123',
      role: 'SUPER_ADMIN',
      active: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejeita campo arbitrário de ordenação', () => {
    expect(listUsersQuerySchema.safeParse({ sortBy: 'passwordHash' }).success).toBe(false);
  });

  it('normaliza paginação e filtros vindos da query string', () => {
    const result = listUsersQuerySchema.parse({ page: '2', pageSize: '20', active: 'false' });
    expect(result).toMatchObject({ page: 2, pageSize: 20, active: false, sortBy: 'name', sortOrder: 'asc' });
  });
});

