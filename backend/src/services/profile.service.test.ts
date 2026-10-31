import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProfileRepository } from '../repositories/user.repository.js';
import type { ManagedUser, PrivateProfileUser } from '../types/user.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';
import type { AuditTransaction } from './audit.service.js';
import { ProfileService } from './profile.service.js';

class InMemoryProfileRepository implements ProfileRepository {
  constructor(public user: PrivateProfileUser | null) {}

  async findPrivateById(id: string): Promise<PrivateProfileUser | null> {
    return this.user?.id === id ? this.user : null;
  }

  async updateOwnName(id: string, name: string, _transaction?: AuditTransaction): Promise<ManagedUser> {
    if (!this.user || this.user.id !== id) throw new Error('Usuário ausente.');
    this.user = { ...this.user, name, updatedAt: new Date() };
    return this.user;
  }

  async updatePassword(id: string, passwordHash: string, _transaction?: AuditTransaction): Promise<void> {
    if (!this.user || this.user.id !== id) throw new Error('Usuário ausente.');
    this.user = { ...this.user, passwordHash, tokenVersion: this.user.tokenVersion + 1, updatedAt: new Date() };
  }
}

describe('ProfileService', () => {
  const id = randomUUID();
  let repository: InMemoryProfileRepository;
  let audit: RecordingAuditLogger;
  let service: ProfileService;

  beforeEach(async () => {
    repository = new InMemoryProfileRepository({
      id,
      name: 'Carlos Silva',
      email: 'carlos@empresa.com',
      role: UserRole.ANALISTA,
      active: true,
      tokenVersion: 2,
      passwordHash: await bcrypt.hash('Atual@123', 4),
      createdAt: new Date('2026-09-01T12:00:00.000Z'),
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
    });
    audit = new RecordingAuditLogger();
    service = new ProfileService(repository, audit);
  });

  it('CT005, CT008 e CT027: altera somente o nome e registra o diff', async () => {
    const updated = await service.update(id, { name: 'Carlos da Silva' });
    expect(updated).toMatchObject({ id, name: 'Carlos da Silva', role: UserRole.ANALISTA, active: true });
    expect(updated).not.toHaveProperty('passwordHash');
    expect(audit.entries).toEqual([expect.objectContaining({
      userId: id,
      entityType: AuditEntity.USER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldData: { name: 'Carlos Silva' },
      newData: { name: 'Carlos da Silva' },
    })]);
  });

  it('não gera auditoria quando o nome não mudou', async () => {
    await service.update(id, { name: 'Carlos Silva' });
    expect(audit.entries).toHaveLength(0);
  });

  it('CT012: rejeita senha atual incorreta sem alterar o hash', async () => {
    const previousHash = repository.user!.passwordHash;
    await expect(service.changePassword(id, {
      currentPassword: 'Incorreta@123', newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    })).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT', message: 'Senha atual incorreta.' });
    expect(repository.user!.passwordHash).toBe(previousHash);
    expect(repository.user!.tokenVersion).toBe(2);
  });

  it('CT015: rejeita uma nova senha equivalente à atual', async () => {
    await expect(service.changePassword(id, {
      currentPassword: 'Atual@123', newPassword: 'Atual@123', confirmPassword: 'Atual@123',
    })).rejects.toMatchObject({ code: 'PASSWORD_UNCHANGED', message: 'A nova senha deve ser diferente da senha atual.' });
  });

  it('CT011, CT016-017 e CT028-029: cria novo hash, incrementa versão e audita sem segredos', async () => {
    const previousHash = repository.user!.passwordHash;
    await service.changePassword(id, {
      currentPassword: 'Atual@123', newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    });

    expect(repository.user!.passwordHash).not.toBe(previousHash);
    expect(repository.user!.passwordHash).not.toBe('NovaSenha@123');
    expect(await bcrypt.compare('NovaSenha@123', repository.user!.passwordHash)).toBe(true);
    expect(repository.user!.tokenVersion).toBe(3);
    expect(audit.entries).toEqual([expect.objectContaining({
      userId: id,
      entityType: AuditEntity.USER,
      entityId: id,
      action: AuditAction.PASSWORD_CHANGE,
      newData: { userId: id, changed: true },
    })]);
    expect(JSON.stringify(audit.entries)).not.toMatch(/Atual@123|NovaSenha@123|passwordHash/);
  }, 15_000);

  it('bloqueia usuário inativo', async () => {
    repository.user = { ...repository.user!, active: false };
    await expect(service.update(id, { name: 'Novo nome' })).rejects.toMatchObject({ code: 'USER_UNAVAILABLE' });
    await expect(service.changePassword(id, {
      currentPassword: 'Atual@123', newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    })).rejects.toMatchObject({ code: 'USER_UNAVAILABLE' });
  });
});
