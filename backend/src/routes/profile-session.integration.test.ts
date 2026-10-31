import { createHmac, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

describe.skipIf(process.env.RUN_DB_INTEGRATION !== '1')('sessão após alteração de senha com PostgreSQL real', () => {
  const userId = randomUUID();
  const email = `profile-${userId}@teste.local`;
  const currentPassword = 'Atual@123';
  const newPassword = 'NovaSenha@123';
  const compactId = userId.replaceAll('-', '');
  const clientIp = `2001:db8:${compactId.slice(0, 4)}:${compactId.slice(4, 8)}:${compactId.slice(8, 12)}::1`;
  const accountHash = createHmac('sha256', env.JWT_SECRET).update(`rate-limit:ACCOUNT:${email}`).digest('hex');
  const ipHash = createHmac('sha256', env.JWT_SECRET).update(`rate-limit:IP:${clientIp}`).digest('hex');
  const jsonHeaders = { 'Content-Type': 'application/json', 'X-Forwarded-For': clientIp };
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    await prisma.user.create({ data: {
      id: userId,
      name: 'Usuário Perfil Integração',
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

  it('login → troca → token antigo rejeitado → login antigo falha → login novo funciona', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ email, password: currentPassword }),
    });
    expect(login.status).toBe(200);
    const { token: oldToken } = (await login.json()) as { token: string };

    const change = await fetch(`${baseUrl}/api/profile/password`, {
      method: 'PATCH',
      headers: { ...jsonHeaders, Authorization: `Bearer ${oldToken}` },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
    });
    expect(change.status).toBe(204);

    const oldSession = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
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
    const { token: newToken } = (await newLogin.json()) as { token: string };
    const restored = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    expect(restored.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.passwordHash).not.toBe(newPassword);
    expect(stored.tokenVersion).toBe(1);
    expect(await bcrypt.compare(newPassword, stored.passwordHash)).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'USER', entityId: userId, action: 'PASSWORD_CHANGE' },
    });
    expect(audit.userId).toBe(userId);
    expect(audit.newData).toEqual({ userId, changed: true });
    expect(JSON.stringify(audit)).not.toMatch(/Atual@123|NovaSenha@123|passwordHash/);
  }, 20_000);
});
