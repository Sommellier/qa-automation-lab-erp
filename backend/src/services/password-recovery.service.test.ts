import { createHash, randomUUID } from 'node:crypto';
import { AuditAction, UserRole, type PasswordResetToken, type User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  PasswordResetRepository,
  PasswordResetTokenWithUser,
} from '../repositories/password-reset.repository.js';
import type { ProfileRepository, UserRepository } from '../repositories/user.repository.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';
import type { ManagedUser, PrivateProfileUser } from '../types/user.js';
import type { AuditTransaction } from './audit.service.js';
import type { PasswordResetMail, PasswordResetMailer } from './password-reset-mailer.service.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { noopAbuseProtection } from './security-throttle.service.js';

class InMemoryUsers implements Pick<UserRepository, 'findByEmail'>, Pick<ProfileRepository, 'updatePassword'> {
  constructor(public user: User | null) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.user?.email === email ? this.user : null;
  }

  async updatePassword(id: string, passwordHash: string, _transaction?: AuditTransaction): Promise<void> {
    if (!this.user || this.user.id !== id) throw new Error('Usuário ausente.');
    this.user = { ...this.user, passwordHash, tokenVersion: this.user.tokenVersion + 1, updatedAt: new Date() };
  }

  // Mantém a classe estruturalmente compatível caso o contrato de perfil cresça.
  async findPrivateById(): Promise<PrivateProfileUser | null> { return null; }
  async updateOwnName(): Promise<ManagedUser> { throw new Error('Não usado.'); }
}

class InMemoryTokens implements PasswordResetRepository {
  readonly records: PasswordResetToken[] = [];
  allowConsume = true;

  constructor(private readonly users: InMemoryUsers, private readonly createdAt: Date) {}

  async lockUser(): Promise<void> {}

  async create(data: Pick<PasswordResetToken, 'userId' | 'tokenHash' | 'expiresAt'>): Promise<void> {
    this.records.push({ id: randomUUID(), ...data, usedAt: null, createdAt: this.createdAt });
  }

  async findValidByHash(tokenHash: string, now: Date): Promise<PasswordResetTokenWithUser | null> {
    const record = this.records.find((item) => item.tokenHash === tokenHash && !item.usedAt && item.expiresAt > now);
    const user = this.users.user;
    if (!record || !user?.active || record.userId !== user.id) return null;
    return { ...record, user };
  }

  async consume(id: string, usedAt: Date): Promise<boolean> {
    if (!this.allowConsume) return false;
    const record = this.records.find((item) => item.id === id && !item.usedAt && item.expiresAt > usedAt);
    if (!record) return false;
    record.usedAt = usedAt;
    return true;
  }

  async invalidateUnusedForUser(userId: string, usedAt: Date): Promise<void> {
    this.records.filter((item) => item.userId === userId && !item.usedAt).forEach((item) => { item.usedAt = usedAt; });
  }
}

class RecordingMailer implements PasswordResetMailer {
  readonly messages: PasswordResetMail[] = [];
  shouldFail = false;

  async sendReset(mail: PasswordResetMail): Promise<void> {
    if (this.shouldFail) throw new Error('Falha simulada.');
    this.messages.push(mail);
  }
}

describe('PasswordRecoveryService', () => {
  const userId = randomUUID();
  const now = new Date('2026-10-23T15:00:00.000Z');
  const rawToken = 'token-bruto-seguro-com-mais-de-trinta-e-dois-caracteres';
  let users: InMemoryUsers;
  let tokens: InMemoryTokens;
  let mailer: RecordingMailer;
  let audit: RecordingAuditLogger;
  let service: PasswordRecoveryService;

  beforeEach(async () => {
    users = new InMemoryUsers({
      id: userId,
      name: 'Carlos Silva',
      email: 'carlos@empresa.com',
      passwordHash: await bcrypt.hash('Atual@123', 4),
      role: UserRole.ANALISTA,
      active: true,
      tokenVersion: 7,
      createdAt: now,
      updatedAt: now,
    });
    tokens = new InMemoryTokens(users, now);
    mailer = new RecordingMailer();
    audit = new RecordingAuditLogger();
    service = new PasswordRecoveryService(users, tokens, mailer, audit, noopAbuseProtection, () => now, () => rawToken);
  });

  it('não revela conta ausente ou inativa e não cria token', async () => {
    users.user = null;
    await expect(service.request({ email: 'ausente@empresa.com' })).resolves.toBeUndefined();
    users.user = {
      id: userId, name: 'Inativo', email: 'inativo@empresa.com', passwordHash: 'hash', role: UserRole.VISUALIZADOR,
      active: false, tokenVersion: 0, createdAt: now, updatedAt: now,
    };
    await expect(service.request({ email: 'inativo@empresa.com' })).resolves.toBeUndefined();
    expect(tokens.records).toHaveLength(0);
    expect(mailer.messages).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('armazena somente o hash, invalida link anterior e audita sem segredos', async () => {
    await service.request({ email: users.user!.email });
    await service.request({ email: users.user!.email });

    expect(tokens.records).toHaveLength(2);
    expect(tokens.records[0]?.usedAt).toEqual(now);
    expect(tokens.records[1]?.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(JSON.stringify(tokens.records)).not.toContain(rawToken);
    expect(mailer.messages.at(-1)?.resetUrl).toContain(encodeURIComponent(rawToken));
    expect(audit.entries.at(-1)).toEqual(expect.objectContaining({
      userId, action: AuditAction.PASSWORD_RESET_REQUEST,
      newData: { userId, requested: true },
    }));
    expect(JSON.stringify(audit.entries)).not.toMatch(/token-bruto|Atual@123|passwordHash/);
  });

  it('mantém a resposta segura mesmo se o adaptador de e-mail falhar', async () => {
    mailer.shouldFail = true;
    await expect(service.request({ email: users.user!.email })).resolves.toBeUndefined();
    expect(tokens.records).toHaveLength(1);
  });

  it('redefine a senha, consome o link e incrementa a versão que revoga JWTs antigos', async () => {
    await service.request({ email: users.user!.email });
    await service.reset({ token: rawToken, newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123' });

    expect(tokens.records[0]?.usedAt).toEqual(now);
    expect(users.user?.tokenVersion).toBe(8);
    expect(await bcrypt.compare('NovaSenha@123', users.user!.passwordHash)).toBe(true);
    expect(audit.entries.at(-1)).toEqual(expect.objectContaining({
      userId, action: AuditAction.PASSWORD_RESET, newData: { userId, reset: true },
    }));
    expect(JSON.stringify(audit.entries)).not.toMatch(/NovaSenha@123|token-bruto|passwordHash/);
    await expect(service.reset({
      token: rawToken, newPassword: 'OutraSenha@123', confirmPassword: 'OutraSenha@123',
    })).rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' });
  }, 15_000);

  it('rejeita link expirado, senha repetida e consumo perdido em uma corrida', async () => {
    await service.request({ email: users.user!.email });
    tokens.records[0]!.expiresAt = new Date(now.getTime() - 1);
    await expect(service.reset({
      token: rawToken, newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    })).rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' });

    tokens.records[0]!.expiresAt = new Date(now.getTime() + 60_000);
    await expect(service.reset({
      token: rawToken, newPassword: 'Atual@123', confirmPassword: 'Atual@123',
    })).rejects.toMatchObject({ code: 'PASSWORD_UNCHANGED' });

    tokens.allowConsume = false;
    await expect(service.reset({
      token: rawToken, newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    })).rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' });
    expect(users.user?.tokenVersion).toBe(7);
  }, 15_000);
});
