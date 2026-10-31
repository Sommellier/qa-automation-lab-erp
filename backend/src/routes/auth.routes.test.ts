import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole, type User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  passwordResetFindFirst: vi.fn(),
  passwordResetCreate: vi.fn(),
  passwordResetUpdateMany: vi.fn(),
  securityThrottleFindMany: vi.fn(),
  securityThrottleUpsert: vi.fn(),
  securityThrottleDeleteMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: prismaMock.findUnique,
      findMany: prismaMock.findMany,
      count: prismaMock.count,
      create: prismaMock.create,
      update: prismaMock.update,
    },
    auditLog: { create: prismaMock.auditCreate },
    passwordResetToken: {
      findFirst: prismaMock.passwordResetFindFirst,
      create: prismaMock.passwordResetCreate,
      updateMany: prismaMock.passwordResetUpdateMany,
    },
    securityThrottle: {
      findMany: prismaMock.securityThrottleFindMany,
      upsert: prismaMock.securityThrottleUpsert,
      deleteMany: prismaMock.securityThrottleDeleteMany,
    },
    $transaction: prismaMock.transaction,
    $disconnect: vi.fn(),
  },
}));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

interface ErrorResponse {
  error: { code: string; message: string };
}

function responseCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
}

function cookieValue(cookies: string[], name: string): string {
  const match = cookies.join(',').match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`));
  if (!match?.[1]) throw new Error(`Cookie ${name} não encontrado.`);
  return match[1];
}

function sessionCookieHeader(response: Response): { cookie: string; csrf: string } {
  const cookies = responseCookies(response);
  const access = cookieValue(cookies, 'qa_access_token');
  const refresh = cookieValue(cookies, 'qa_refresh_token');
  const csrf = cookieValue(cookies, 'qa_csrf_token');
  return { cookie: `qa_access_token=${access}; qa_refresh_token=${refresh}; qa_csrf_token=${csrf}`, csrf };
}

describe('rotas de autenticação', () => {
  let server: Server;
  let baseUrl: string;
  let user: User;

  beforeAll(async () => {
    user = {
      id: randomUUID(),
      name: 'Administrador',
      email: 'admin@qamgmt.local',
      passwordHash: await bcrypt.hash('Admin@123', 4),
      role: UserRole.ADMIN,
      active: true,
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor de teste não iniciou.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    Object.values(prismaMock).forEach((mock) => mock.mockReset());
    prismaMock.transaction.mockImplementation((operation: unknown) => {
      if (typeof operation === 'function') {
        return operation({
          user: {
            findUnique: prismaMock.findUnique,
            findMany: prismaMock.findMany,
            count: prismaMock.count,
            create: prismaMock.create,
            update: prismaMock.update,
          },
          auditLog: { create: prismaMock.auditCreate },
          passwordResetToken: {
            findFirst: prismaMock.passwordResetFindFirst,
            create: prismaMock.passwordResetCreate,
            updateMany: prismaMock.passwordResetUpdateMany,
          },
          securityThrottle: {
            findMany: prismaMock.securityThrottleFindMany,
            upsert: prismaMock.securityThrottleUpsert,
            deleteMany: prismaMock.securityThrottleDeleteMany,
          },
          $queryRaw: prismaMock.queryRaw,
        });
      }
      return Promise.all(operation as Array<Promise<unknown>>);
    });
    prismaMock.auditCreate.mockResolvedValue({ id: randomUUID() });
    prismaMock.passwordResetCreate.mockResolvedValue({ id: randomUUID() });
    prismaMock.passwordResetUpdateMany.mockResolvedValue({ count: 1 });
    prismaMock.queryRaw.mockResolvedValue([{ locked: 1 }]);
    prismaMock.securityThrottleFindMany.mockResolvedValue([]);
    prismaMock.securityThrottleUpsert.mockResolvedValue({ id: randomUUID() });
    prismaMock.securityThrottleDeleteMany.mockResolvedValue({ count: 1 });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('POST /api/auth/login retorna usuário público e grava a sessão em cookies seguros', async () => {
    prismaMock.findUnique.mockResolvedValue(user);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Admin@123' }),
    });
    const body = (await response.json()) as { user: Record<string, unknown>; token?: string };
    const cookies = responseCookies(response);

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ email: user.email, role: UserRole.ADMIN });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('token');
    const accessCookie = cookies.find((cookie) => cookie.startsWith('qa_access_token='));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith('qa_refresh_token='));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith('qa_csrf_token='));
    expect(accessCookie).toMatch(/Path=\/api(?:;|$)/i);
    expect(accessCookie).toMatch(/HttpOnly/i);
    expect(accessCookie).toMatch(/SameSite=Lax/i);
    expect(refreshCookie).toMatch(/Path=\/api\/auth(?:;|$)/i);
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Lax/i);
    expect(csrfCookie).toMatch(/Path=\/(?:;|$)/i);
    expect(csrfCookie).toMatch(/SameSite=Lax/i);
    expect(csrfCookie).not.toMatch(/HttpOnly/i);
  });

  it('valida o corpo do login', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'E-mail é obrigatório.' });
  });

  it('retorna 429 com Retry-After quando IP ou conta está temporariamente bloqueado', async () => {
    prismaMock.securityThrottleFindMany.mockResolvedValue([{
      id: randomUUID(),
      scope: 'LOGIN_ACCOUNT',
      subjectHash: 'a'.repeat(64),
      attemptCount: 0,
      blockLevel: 1,
      windowStartedAt: new Date(),
      blockedUntil: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Admin@123' }),
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(59);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(prismaMock.findUnique).not.toHaveBeenCalled();
  });

  it('audita login inválido sem registrar e-mail, IP ou senha em claro', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Incorreta@123' }),
    });

    expect(response.status).toBe(401);
    expect(prismaMock.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        entityType: 'SECURITY',
        action: 'LOGIN_FAILURE',
        newData: { flow: 'LOGIN', outcome: 'FAILED', reason: 'INVALID_CREDENTIALS' },
      }),
    }));
    expect(JSON.stringify(prismaMock.auditCreate.mock.calls)).not.toMatch(/admin@qamgmt\.local|Incorreta@123|127\.0\.0\.1/);
  });

  it('POST /api/auth/forgot-password responde igual para conta existente e ausente', async () => {
    prismaMock.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(user);

    const requestRecovery = () => fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const missingResponse = await requestRecovery();
    const missingBody = await missingResponse.json();
    const existingResponse = await requestRecovery();
    const existingBody = await existingResponse.json();

    expect(missingResponse.status).toBe(202);
    expect(existingResponse.status).toBe(202);
    expect(existingBody).toEqual(missingBody);
    expect(existingBody).toEqual({
      message: 'Se o e-mail estiver cadastrado e ativo, enviaremos instruções para redefinir a senha.',
    });
    expect(prismaMock.passwordResetCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: user.id, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    }));
    const serializedCall = JSON.stringify(prismaMock.passwordResetCreate.mock.calls);
    expect(serializedCall).not.toMatch(/reset-password[#?]token=/);
    expect(prismaMock.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PASSWORD_RESET_REQUEST', newData: { userId: user.id, requested: true } }),
    }));
  });

  it('POST /api/auth/reset-password usa erro único para link inválido', async () => {
    prismaMock.passwordResetFindFirst.mockResolvedValue(null);
    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'token-seguro-com-mais-de-trinta-e-dois-caracteres',
        newPassword: 'NovaSenha@123',
        confirmPassword: 'NovaSenha@123',
      }),
    });
    const body = (await response.json()) as ErrorResponse;
    expect(response.status).toBe(400);
    expect(body.error).toEqual({ code: 'PASSWORD_RESET_INVALID', message: 'Link de redefinição inválido ou expirado.' });
    expect(prismaMock.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        entityType: 'SECURITY',
        action: 'PASSWORD_RESET_FAILURE',
        newData: { flow: 'PASSWORD_RECOVERY', outcome: 'FAILED', reason: 'INVALID_LINK' },
      }),
    }));
    expect(JSON.stringify(prismaMock.auditCreate.mock.calls)).not.toMatch(/token-seguro-com/);
  });

  it('POST /api/auth/reset-password consome o token e revoga as sessões', async () => {
    const resetToken = {
      id: randomUUID(), userId: user.id, tokenHash: 'hash', expiresAt: new Date(Date.now() + 60_000),
      usedAt: null, createdAt: new Date(), user,
    };
    prismaMock.passwordResetFindFirst.mockResolvedValue(resetToken);
    prismaMock.update.mockResolvedValue({ id: user.id });

    const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'token-seguro-com-mais-de-trinta-e-dois-caracteres',
        newPassword: 'NovaSenha@123',
        confirmPassword: 'NovaSenha@123',
      }),
    });

    expect(response.status).toBe(204);
    expect(prismaMock.passwordResetUpdateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { passwordHash: expect.any(String), tokenVersion: { increment: 1 } },
    }));
    expect(prismaMock.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'PASSWORD_RESET', newData: { userId: user.id, reset: true } }),
    }));
  }, 15_000);

  it('GET /api/auth/me exige token', async () => {
    const response = await fetch(`${baseUrl}/api/auth/me`);
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('MISSING_TOKEN');
  });

  it('GET /api/auth/me restaura uma sessão válida', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Admin@123' }),
    });
    await loginResponse.json();
    const session = sessionCookieHeader(loginResponse);

    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: session.cookie },
    });
    const body = (await response.json()) as { user: { email: string; role: UserRole } };

    expect(response.status).toBe(200);
    expect(body.user).toEqual(expect.objectContaining({ email: user.email, role: UserRole.ADMIN }));
    expect(body.user).toEqual(expect.objectContaining({ active: true, createdAt: expect.any(String), updatedAt: expect.any(String) }));
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('rejeita um token cuja versão não corresponde mais ao usuário', async () => {
    prismaMock.findUnique.mockResolvedValue({ ...user, tokenVersion: 2 });
    const oldToken = createAccessToken(user.id, user.role, 1);
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    const body = (await response.json()) as ErrorResponse;
    expect(response.status).toBe(401);
    expect(body.error.code).toBe('SESSION_INVALIDATED');
  });

  it.each([
    ['PATCH', '/api/profile'],
    ['PATCH', '/api/profile/password'],
  ])('%s %s exige autenticação', async (method, path) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });

  it('PATCH /api/profile altera somente o próprio nome e não expõe hash', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    prismaMock.update.mockResolvedValue({ ...user, name: 'Administrador Atualizado' });
    const token = createAccessToken(user.id, user.role, user.tokenVersion);
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Administrador Atualizado' }),
    });
    const body = (await response.json()) as { user: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ id: user.id, name: 'Administrador Atualizado', role: UserRole.ADMIN, active: true });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(prismaMock.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Administrador Atualizado' } }));
    expect(prismaMock.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: user.id, entityId: user.id, action: 'UPDATE', oldData: { name: user.name }, newData: { name: 'Administrador Atualizado' },
    }) }));
  });

  it('PATCH /api/profile rejeita role, active e id enviados por mass assignment', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const token = createAccessToken(user.id, user.role, user.tokenVersion);
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Tentativa', role: UserRole.VISUALIZADOR, active: false, id: randomUUID() }),
    });
    expect(response.status).toBe(400);
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it('PATCH /api/profile/password limita e audita senha atual incorreta', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const token = createAccessToken(user.id, user.role, user.tokenVersion);
    const response = await fetch(`${baseUrl}/api/profile/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        currentPassword: 'Incorreta@123',
        newPassword: 'NovaSenha@123',
        confirmPassword: 'NovaSenha@123',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'CURRENT_PASSWORD_INCORRECT' } });
    expect(prismaMock.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: user.id,
        entityType: 'USER',
        entityId: user.id,
        action: 'PASSWORD_CHANGE_FAILURE',
        newData: { flow: 'PASSWORD_CHANGE', outcome: 'FAILED', reason: 'CURRENT_PASSWORD_INCORRECT' },
      }),
    }));
    expect(JSON.stringify(prismaMock.auditCreate.mock.calls)).not.toMatch(/Incorreta@123|NovaSenha@123/);
  });

  it('POST /api/auth/logout responde 204 para uma sessão válida', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Admin@123' }),
    });
    await loginResponse.json();
    const session = sessionCookieHeader(loginResponse);

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(responseCookies(response).filter((cookie) => /qa_(access|refresh|csrf)_token=/.test(cookie)))
      .toHaveLength(3);
  });

  it('bloqueia mutação autenticada por cookie sem o cabeçalho CSRF', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Admin@123' }),
    });
    await loginResponse.json();
    const session = sessionCookieHeader(loginResponse);

    const response = await fetch(`${baseUrl}/api/profile`, {
      method: 'PATCH',
      headers: { Cookie: session.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tentativa sem CSRF' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CSRF_TOKEN' } });
    expect(prismaMock.update).not.toHaveBeenCalled();
  });

  it('renova e rotaciona os cookies com refresh token e CSRF válidos', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'Admin@123' }),
    });
    await loginResponse.json();
    const original = sessionCookieHeader(loginResponse);

    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: original.cookie, 'X-CSRF-Token': original.csrf },
    });
    const renewed = sessionCookieHeader(response);

    expect(response.status).toBe(204);
    expect(renewed.cookie).not.toBe(original.cookie);
    expect(renewed.csrf).not.toBe(original.csrf);
  });

  it('GET /api/users retorna 403 para um ANALISTA autenticado', async () => {
    const analyst = { ...user, id: randomUUID(), role: UserRole.ANALISTA, email: 'analista@qamgmt.local' };
    prismaMock.findUnique.mockResolvedValue(analyst);
    const token = createAccessToken(analyst.id, analyst.role);

    const response = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/users lista dados paginados para ADMIN sem expor senha', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    prismaMock.findMany.mockResolvedValue([{ ...user, passwordHash: undefined }]);
    prismaMock.count.mockResolvedValue(1);
    const token = createAccessToken(user.id, user.role);

    const response = await fetch(
      `${baseUrl}/api/users?search=admin&role=ADMIN&active=true&page=1&pageSize=10&sortBy=email&sortOrder=desc`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>>; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.pagination.total).toBe(1);
    expect(body.data[0]).not.toHaveProperty('passwordHash');
    expect(prismaMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 10,
      skip: 0,
      orderBy: { email: 'desc' },
    }));
  });

  it('POST /api/users cria usuário para ADMIN', async () => {
    const createdUser = {
      id: randomUUID(),
      name: 'Novo Analista',
      email: 'novo@empresa.com',
      role: UserRole.ANALISTA,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    prismaMock.create.mockResolvedValue(createdUser);
    const token = createAccessToken(user.id, user.role);

    const response = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createdUser.name,
        email: createdUser.email,
        password: 'Senha@123',
        role: UserRole.ANALISTA,
        active: true,
      }),
    });
    const body = (await response.json()) as { user: Record<string, unknown> };

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({ email: createdUser.email, role: UserRole.ANALISTA });
    expect(prismaMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: expect.any(String) }),
    }));
  });

  it('rejeita ID e perfil inválidos diretamente na API', async () => {
    prismaMock.findUnique.mockResolvedValue(user);
    const token = createAccessToken(user.id, user.role);

    const invalidIdResponse = await fetch(`${baseUrl}/api/users/id-invalido`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const invalidRoleResponse = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usuário',
        email: 'usuario@empresa.com',
        password: 'Senha@123',
        role: 'SUPER_ADMIN',
        active: true,
      }),
    });

    expect(invalidIdResponse.status).toBe(400);
    expect(invalidRoleResponse.status).toBe(400);
  });
});
