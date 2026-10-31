import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole, type Client, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  clientFindUnique: vi.fn(),
  clientFindMany: vi.fn(),
  clientCount: vi.fn(),
  clientCreate: vi.fn(),
  clientUpdate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: { findUnique: prismaMock.userFindUnique },
    client: {
      findUnique: prismaMock.clientFindUnique,
      findMany: prismaMock.clientFindMany,
      count: prismaMock.clientCount,
      create: prismaMock.clientCreate,
      update: prismaMock.clientUpdate,
    },
    auditLog: { create: prismaMock.auditCreate },
    $transaction: prismaMock.transaction,
    $disconnect: vi.fn(),
  },
}));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de clientes', () => {
  let server: Server;
  let baseUrl: string;
  let client: Client;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve());
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
          client: {
            findUnique: prismaMock.clientFindUnique,
            create: prismaMock.clientCreate,
            update: prismaMock.clientUpdate,
          },
          auditLog: { create: prismaMock.auditCreate },
        });
      }
      return Promise.all(operation as Array<Promise<unknown>>);
    });
    prismaMock.auditCreate.mockResolvedValue({ id: randomUUID() });
    const now = new Date();
    client = { id: randomUUID(), name: 'Carlos Silva', document: '12345678900', email: 'carlos@empresa.com', phone: null, active: true, createdAt: now, updatedAt: now };
    prismaMock.clientFindMany.mockResolvedValue([client]);
    prismaMock.clientCount.mockResolvedValue(1);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  function authenticateAs(role: UserRole): string {
    const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = {
      id: randomUUID(), name: role, email: `${role.toLowerCase()}@qamgmt.local`, role, active: true,
    };
    prismaMock.userFindUnique.mockResolvedValue(user);
    return createAccessToken(user.id, role);
  }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('GET /api/clients permite consulta para %s', async (role) => {
    const response = await fetch(`${baseUrl}/api/clients?page=1&pageSize=10&sortBy=document&sortOrder=desc`, {
      headers: { Authorization: `Bearer ${authenticateAs(role)}` },
    });
    expect(response.status).toBe(200);
    expect(prismaMock.clientFindMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { document: 'desc' }, skip: 0, take: 10 }));
  });

  it.each([UserRole.ADMIN, UserRole.ANALISTA])('POST /api/clients permite criação para %s', async (role) => {
    prismaMock.clientFindUnique.mockResolvedValue(null);
    prismaMock.clientCreate.mockResolvedValue(client);
    const response = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authenticateAs(role)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: client.name, document: client.document, email: client.email, active: true }),
    });
    expect(response.status).toBe(201);
  });

  it('nega criação e edição para VISUALIZADOR', async () => {
    const token = authenticateAs(UserRole.VISUALIZADOR);
    const createResponse = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    const updateResponse = await fetch(`${baseUrl}/api/clients/${client.id}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Novo Nome' }),
    });
    expect(createResponse.status).toBe(403);
    expect(updateResponse.status).toBe(403);
  });

  it('permite alterar status somente para ADMIN', async () => {
    prismaMock.clientFindUnique.mockResolvedValue(client);
    prismaMock.clientUpdate.mockResolvedValue({ ...client, active: false });
    const adminResponse = await fetch(`${baseUrl}/api/clients/${client.id}/status`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${authenticateAs(UserRole.ADMIN)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
    });
    expect(adminResponse.status).toBe(200);

    for (const role of [UserRole.ANALISTA, UserRole.VISUALIZADOR]) {
      const response = await fetch(`${baseUrl}/api/clients/${client.id}/status`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${authenticateAs(role)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }),
      });
      expect(response.status).toBe(403);
    }
  });

  it('retorna 404 com mensagem para cliente inexistente', async () => {
    prismaMock.clientFindUnique.mockResolvedValue(null);
    const response = await fetch(`${baseUrl}/api/clients/${randomUUID()}`, { headers: { Authorization: `Bearer ${authenticateAs(UserRole.ADMIN)}` } });
    const body = await response.json() as { error: { message: string } };
    expect(response.status).toBe(404);
    expect(body.error.message).toBe('Cliente não encontrado.');
  });

  it('rejeita ordenação e payload inválidos', async () => {
    const token = authenticateAs(UserRole.ADMIN);
    const sortResponse = await fetch(`${baseUrl}/api/clients?sortBy=password`, { headers: { Authorization: `Bearer ${token}` } });
    const createResponse = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '', document: '', email: '' }),
    });
    expect(sortResponse.status).toBe(400);
    expect(createResponse.status).toBe(400);
  });
});
