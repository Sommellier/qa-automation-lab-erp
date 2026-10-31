import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, UserRole, type User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import type { UserManagementRepository, UserRepository } from '../repositories/user.repository.js';
import type { CreateUserData, ListUsersInput, ManagedUser, UpdateUserData } from '../types/user.js';
import { AuthService } from './auth.service.js';
import { UserService } from './user.service.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';

class InMemoryUsers implements UserManagementRepository, UserRepository {
  private records: User[] = [];

  async seed(entries: Array<Omit<User, 'passwordHash'> & { password: string }>): Promise<void> {
    this.records = await Promise.all(
      entries.map(async ({ password, ...entry }) => ({
        ...entry,
        passwordHash: await bcrypt.hash(password, 4),
      })),
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.records.find((user) => user.email === email) ?? null;
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.records.find((user) => user.id === id) ?? null;
  }

  async findById(id: string): Promise<ManagedUser | null> {
    const user = this.records.find((record) => record.id === id);
    return user ? this.toManagedUser(user) : null;
  }

  async list(input: ListUsersInput): Promise<{ users: ManagedUser[]; total: number }> {
    const search = input.search?.toLowerCase();
    const filtered = this.records
      .filter((user) => !search || user.name.toLowerCase().includes(search) || user.email.includes(search))
      .filter((user) => !input.role || user.role === input.role)
      .filter((user) => input.active === undefined || user.active === input.active)
      .sort((left, right) => {
        const leftValue = left[input.sortBy];
        const rightValue = right[input.sortBy];
        const result = leftValue instanceof Date && rightValue instanceof Date
          ? leftValue.getTime() - rightValue.getTime()
          : String(leftValue).localeCompare(String(rightValue));
        return input.sortOrder === 'asc' ? result : -result;
      });
    const start = (input.page - 1) * input.pageSize;

    return {
      users: filtered.slice(start, start + input.pageSize).map((user) => this.toManagedUser(user)),
      total: filtered.length,
    };
  }

  async create(data: CreateUserData): Promise<ManagedUser> {
    const now = new Date();
    const user: User = { id: randomUUID(), tokenVersion: 0, createdAt: now, updatedAt: now, ...data };
    this.records.push(user);
    return this.toManagedUser(user);
  }

  async update(id: string, data: UpdateUserData): Promise<ManagedUser> {
    const index = this.records.findIndex((user) => user.id === id);
    if (index < 0) throw new Error('Usuário não encontrado.');
    const current = this.records[index]!;
    const updated: User = {
      ...current,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    };
    this.records[index] = updated;
    return this.toManagedUser(updated);
  }

  async countActiveAdmins(): Promise<number> {
    return this.records.filter((user) => user.role === UserRole.ADMIN && user.active).length;
  }

  getPasswordHash(email: string): string | undefined {
    return this.records.find((user) => user.email === email)?.passwordHash;
  }

  private toManagedUser(user: User): ManagedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

describe('UserService', () => {
  let repository: InMemoryUsers;
  let service: UserService;
  let adminId: string;
  let analystId: string;
  let viewerId: string;
  let actorId: string;
  let audit: RecordingAuditLogger;

  beforeEach(async () => {
    repository = new InMemoryUsers();
    audit = new RecordingAuditLogger();
    service = new UserService(repository, audit);
    adminId = randomUUID();
    analystId = randomUUID();
    viewerId = randomUUID();
    actorId = adminId;
    const now = new Date();
    await repository.seed([
      { id: adminId, name: 'Administrador', email: 'admin@qamgmt.local', role: UserRole.ADMIN, active: true, tokenVersion: 0, createdAt: now, updatedAt: now, password: 'Admin@123' },
      { id: analystId, name: 'Carlos Analista', email: 'carlos@empresa.com', role: UserRole.ANALISTA, active: true, tokenVersion: 0, createdAt: now, updatedAt: now, password: 'Analista@123' },
      { id: viewerId, name: 'Maria Consulta', email: 'maria@empresa.com', role: UserRole.VISUALIZADOR, active: false, tokenVersion: 0, createdAt: now, updatedAt: now, password: 'Visualizador@123' },
    ]);
  });

  it.each([UserRole.ANALISTA, UserRole.VISUALIZADOR])('cria usuário %s com senha bcrypt', async (role) => {
    const email = `${role.toLowerCase()}-novo@empresa.com`;
    const created = await service.create({
      name: `Novo ${role}`,
      email,
      password: 'Senha@123',
      role,
      active: true,
    }, actorId);

    expect(created).toMatchObject({ email, role, active: true });
    expect(created).not.toHaveProperty('passwordHash');
    expect(await bcrypt.compare('Senha@123', repository.getPasswordHash(email)!)).toBe(true);
    expect(audit.entries[0]).toMatchObject({ userId: actorId, entityType: AuditEntity.USER, action: AuditAction.CREATE });
    expect(JSON.stringify(audit.entries[0])).not.toMatch(/password/i);
  });

  it('bloqueia e-mail duplicado', async () => {
    await expect(service.create({
      name: 'Outro Admin',
      email: 'admin@qamgmt.local',
      password: 'Senha@123',
      role: UserRole.ADMIN,
      active: true,
    }, actorId)).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('edita nome, e-mail e perfil', async () => {
    const updated = await service.update(analystId, {
      name: 'Carlos Atualizado',
      email: 'carlos.atualizado@empresa.com',
      role: UserRole.VISUALIZADOR,
    }, actorId);

    expect(updated).toMatchObject({
      name: 'Carlos Atualizado',
      email: 'carlos.atualizado@empresa.com',
      role: UserRole.VISUALIZADOR,
    });
    expect(audit.entries[0]).toMatchObject({ action: AuditAction.ROLE_CHANGE, oldData: expect.objectContaining({ role: UserRole.ANALISTA }), newData: expect.objectContaining({ role: UserRole.VISUALIZADOR }) });
  });

  it('inativa e reativa um usuário, refletindo a regra no login', async () => {
    const authService = new AuthService(repository);
    await service.updateStatus(analystId, { active: false }, actorId);

    await expect(authService.login({ email: 'carlos@empresa.com', password: 'Analista@123' }))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });

    await service.updateStatus(analystId, { active: true }, actorId);
    await expect(authService.login({ email: 'carlos@empresa.com', password: 'Analista@123' }))
      .resolves.toMatchObject({ user: { role: UserRole.ANALISTA } });
    expect(audit.entries.map((entry) => entry.action)).toEqual([AuditAction.DEACTIVATE, AuditAction.ACTIVATE]);
  });

  it('pesquisa parcialmente por nome ou e-mail e aplica filtros', async () => {
    const searchResult = await service.list({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', search: 'carlos' });
    const roleResult = await service.list({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', role: UserRole.ANALISTA });
    const statusResult = await service.list({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', active: false });

    expect(searchResult.data.map((user) => user.id)).toEqual([analystId]);
    expect(roleResult.data.every((user) => user.role === UserRole.ANALISTA)).toBe(true);
    expect(statusResult.data.map((user) => user.id)).toEqual([viewerId]);
  });

  it('retorna metadados de paginação', async () => {
    const result = await service.list({ page: 2, pageSize: 2, sortBy: 'email', sortOrder: 'asc' });
    expect(result.pagination).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(result.data).toHaveLength(1);
  });

  it('não permite inativar nem rebaixar o último ADMIN ativo', async () => {
    await expect(service.updateStatus(adminId, { active: false }, actorId))
      .rejects.toMatchObject({ statusCode: 409, code: 'LAST_ACTIVE_ADMIN' });
    await expect(service.update(adminId, { role: UserRole.ANALISTA }, actorId))
      .rejects.toMatchObject({ statusCode: 409, code: 'LAST_ACTIVE_ADMIN' });
  });
});

