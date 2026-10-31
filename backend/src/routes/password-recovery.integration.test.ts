import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { PrismaPasswordResetRepository } from '../repositories/password-reset.repository.js';
import { PrismaUserRepository } from '../repositories/user.repository.js';
import { auditLogger } from '../services/audit.service.js';
import type { PasswordResetMail, PasswordResetMailer } from '../services/password-reset-mailer.service.js';
import { PasswordRecoveryService } from '../services/password-recovery.service.js';

class CapturingMailer implements PasswordResetMailer {
  messages: PasswordResetMail[] = [];
  async sendReset(mail: PasswordResetMail): Promise<void> { this.messages.push(mail); }
}

describe.skipIf(process.env.RUN_DB_INTEGRATION !== '1')('recuperação de senha com PostgreSQL real', () => {
  const userId = randomUUID();
  const email = `recovery-${userId}@teste.local`;
  const currentPassword = 'Atual@123';
  const newPassword = 'NovaSenha@123';
  const compactId = userId.replaceAll('-', '');
  const clientIp = `2001:db8:${compactId.slice(0, 4)}:${compactId.slice(4, 8)}:${compactId.slice(8, 12)}::1`;
  const accountHash = createHmac('sha256', env.JWT_SECRET).update(`rate-limit:ACCOUNT:${email}`).digest('hex');
  const ipHash = createHmac('sha256', env.JWT_SECRET).update(`rate-limit:IP:${clientIp}`).digest('hex');
  const jsonHeaders = { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp };
  const mailer = new CapturingMailer();
  const recovery = new PasswordRecoveryService(
    new PrismaUserRepository(),
    new PrismaPasswordResetRepository(),
    mailer,
    auditLogger,
  );
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    await prisma.user.create({ data: {
      id: userId,
      name: 'Usuário Recuperação Integração',
      email,
      passwordHash: await bcrypt.hash(currentPassword, 4),
      role: UserRole.ANALISTA,
      active: true,
    } });
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor de integração não iniciou.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [
      { entityType: 'USER', entityId: userId },
      { entityType: 'SECURITY', entityId: accountHash },
    ] } });
    await prisma.securityThrottle.deleteMany({ where: { subjectHash: { in: [ipHash, accountHash] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('solicita → guarda hash → redefine → revoga JWT → impede reuso', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ email, password: currentPassword }),
    });
    expect(login.status).toBe(200);
    const { token: oldJwt } = (await login.json()) as { token: string };

    await Promise.all([recovery.request({ email }), recovery.request({ email })]);
    expect(mailer.messages).toHaveLength(2);
    const storedToken = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId, usedAt: null } });
    expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(1);
    const resetUrls = mailer.messages.map((message) => new URL(message.resetUrl));
    const rawToken = resetUrls
      .map((url) => new URLSearchParams(url.hash.slice(1)).get('token'))
      .find((token) => token && createHash('sha256').update(token).digest('hex') === storedToken.tokenHash);
    expect(rawToken).toBeTruthy();
    expect(resetUrls.every((url) => url.search === '')).toBe(true);

    expect(storedToken.tokenHash).toBe(createHash('sha256').update(rawToken!).digest('hex'));
    expect(JSON.stringify(storedToken)).not.toContain(rawToken!);

    await recovery.reset({ token: rawToken!, newPassword, confirmPassword: newPassword });
    const usedToken = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: storedToken.id } });
    expect(usedToken.usedAt).not.toBeNull();

    const oldSession = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${oldJwt}` } });
    expect(oldSession.status).toBe(401);
    expect(await oldSession.json()).toMatchObject({ error: { code: 'SESSION_INVALIDATED' } });

    const oldLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ email, password: currentPassword }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(newLogin.status).toBe(200);

    await expect(recovery.reset({ token: rawToken!, newPassword: 'OutraSenha@123', confirmPassword: 'OutraSenha@123' }))
      .rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' });

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updatedUser.tokenVersion).toBe(1);
    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: 'USER', entityId: userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditEntries.map((entry) => entry.action)).toEqual([
      'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET',
    ]);
    expect(JSON.stringify(auditEntries)).not.toMatch(/Atual@123|NovaSenha@123|OutraSenha@123/);
    expect(JSON.stringify(auditEntries)).not.toContain(rawToken!);
  }, 30_000);
});
