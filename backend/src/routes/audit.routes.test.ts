import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { AuditAction, AuditEntity, UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ userFindUnique: vi.fn(), auditFindMany: vi.fn(), auditCount: vi.fn(), transaction: vi.fn() }));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: { findUnique: mock.userFindUnique },
    auditLog: { findMany: mock.auditFindMany, count: mock.auditCount },
    $transaction: mock.transaction,
    $disconnect: vi.fn(),
  },
}));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de auditoria', () => {
  let server: Server;
  let baseUrl: string;
  const actorId = randomUUID();
  const entityId = randomUUID();

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    Object.values(mock).forEach((entry) => entry.mockReset());
    mock.auditFindMany.mockResolvedValue([{ id: randomUUID(), userId: actorId, user: { id: actorId, name: 'Admin', email: 'admin@qamgmt.local' }, entityType: AuditEntity.PRODUCT, entityId, action: AuditAction.UPDATE, oldData: { price: '299.90' }, newData: { price: '349.90' }, createdAt: new Date('2026-09-27T14:30:00.000Z') }]);
    mock.auditCount.mockResolvedValue(25);
    mock.transaction.mockImplementation((operations: Array<Promise<unknown>>) => Promise.all(operations));
  });

  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

  function token(role: UserRole): string {
    const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: actorId, name: role, email: `${role.toLowerCase()}@qamgmt.local`, role, active: true };
    mock.userFindUnique.mockResolvedValue(user);
    return createAccessToken(actorId, role);
  }

  it('permite ADMIN, filtra no banco, pagina e ordena por data', async () => {
    const response = await fetch(`${baseUrl}/api/audit?entityType=PRODUCT&action=UPDATE&userId=${actorId}&entityId=${entityId}&dateFrom=2026-09-01&dateTo=2026-09-27&search=admin&page=2&pageSize=10&sortOrder=asc`, { headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 } });
    expect(mock.auditFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, orderBy: { createdAt: 'asc' }, where: expect.objectContaining({ entityType: AuditEntity.PRODUCT, action: AuditAction.UPDATE, userId: actorId, entityId }) }));
  });

  it.each([UserRole.ANALISTA, UserRole.VISUALIZADOR])('retorna 403 para %s', async (role) => {
    const response = await fetch(`${baseUrl}/api/audit`, { headers: { Authorization: `Bearer ${token(role)}` } });
    expect(response.status).toBe(403);
    expect(mock.auditFindMany).not.toHaveBeenCalled();
  });

  it('retorna 401 sem autenticação', async () => {
    expect((await fetch(`${baseUrl}/api/audit`)).status).toBe(401);
  });

  it.each(['PATCH', 'DELETE', 'PUT'])('não expõe mutação via %s', async (method) => {
    const response = await fetch(`${baseUrl}/api/audit/${randomUUID()}`, { method, headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(404);
  });
});
