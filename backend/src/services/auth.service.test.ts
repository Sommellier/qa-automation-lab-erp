import { randomUUID } from 'node:crypto';
import { UserRole, type User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { beforeAll, describe, expect, it } from 'vitest';
import type { UserRepository } from '../repositories/user.repository.js';
import { AuthService } from './auth.service.js';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret-with-at-least-32-characters';

class InMemoryUserRepository implements UserRepository {
  constructor(private readonly users: User[]) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }
}

describe('AuthService', () => {
  let service: AuthService;
  const password = 'Senha@123';

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const now = new Date();
    const users: User[] = Object.values(UserRole).map((role) => ({
      id: randomUUID(),
      name: role,
      email: `${role.toLowerCase()}@qamgmt.local`,
      passwordHash,
      role,
      active: true,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    }));

    service = new AuthService(new InMemoryUserRepository(users));
  });

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])(
    'autentica um usuário %s sem expor o hash',
    async (role) => {
      const result = await service.login({
        email: `${role.toLowerCase()}@qamgmt.local`,
        password,
      });

      expect(result.user.role).toBe(role);
      expect(result.session.accessToken).toBeTypeOf('string');
      expect(result.session.refreshToken).toBeTypeOf('string');
      expect(result.session.csrfToken).toBeTypeOf('string');
      expect(result.user).not.toHaveProperty('passwordHash');
    },
  );

  it('retorna a mesma mensagem para usuário inexistente e senha incorreta', async () => {
    const attempts = [
      service.login({ email: 'inexistente@qamgmt.local', password }),
      service.login({ email: 'admin@qamgmt.local', password: 'incorreta' }),
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({
        statusCode: 401,
        message: 'E-mail ou senha inválidos.',
      });
    }
  });
});
