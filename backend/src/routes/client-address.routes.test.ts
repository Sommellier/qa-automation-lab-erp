import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { AddressType, UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ userFindUnique: vi.fn(), clientFindUnique: vi.fn(), addressFindMany: vi.fn(), addressCount: vi.fn(), addressFindFirst: vi.fn(), addressCreate: vi.fn(), addressUpdate: vi.fn(), addressUpdateMany: vi.fn(), auditCreate: vi.fn(), queryRaw: vi.fn(), transaction: vi.fn() }));
vi.mock('../config/prisma.js', () => ({ prisma: {
  user: { findUnique: mock.userFindUnique }, client: { findUnique: mock.clientFindUnique },
  clientAddress: { findMany: mock.addressFindMany, count: mock.addressCount, findFirst: mock.addressFindFirst, create: mock.addressCreate, update: mock.addressUpdate, updateMany: mock.addressUpdateMany },
  auditLog: { create: mock.auditCreate }, $queryRaw: mock.queryRaw, $transaction: mock.transaction, $disconnect: vi.fn(),
} }));
import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de endereços de clientes e RBAC', () => {
  let server: Server; let baseUrl: string; const clientId = randomUUID(); const addressId = randomUUID();
  const now = new Date(); const client = { id: clientId, name: 'Carlos', document: 'DOC-1', email: 'carlos@example.com', phone: null, active: true, createdAt: now, updatedAt: now };
  const address = { id: addressId, clientId, type: AddressType.RESIDENTIAL, zipCode: '89200-000', street: 'Rua A', number: '221B', complement: null, district: 'Centro', city: 'Joinville', state: 'SC', country: 'Brasil', isPrimary: true, active: true, createdAt: now, updatedAt: now };

  beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); }); const value = server.address(); if (!value || typeof value === 'string') throw new Error('Servidor não iniciou'); baseUrl = `http://127.0.0.1:${value.port}`; });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  beforeEach(() => {
    Object.values(mock).forEach((fn) => fn.mockReset());
    const tx = { client: { findUnique: mock.clientFindUnique }, clientAddress: { findMany: mock.addressFindMany, count: mock.addressCount, findFirst: mock.addressFindFirst, create: mock.addressCreate, update: mock.addressUpdate, updateMany: mock.addressUpdateMany }, auditLog: { create: mock.auditCreate }, $queryRaw: mock.queryRaw };
    mock.transaction.mockImplementation((operation: unknown) => typeof operation === 'function' ? operation(tx) : Promise.all(operation as Array<Promise<unknown>>));
    mock.clientFindUnique.mockResolvedValue(client); mock.addressFindMany.mockResolvedValue([address]); mock.addressCount.mockResolvedValue(1); mock.addressFindFirst.mockResolvedValue(address); mock.addressCreate.mockResolvedValue(address); mock.addressUpdate.mockResolvedValue(address); mock.addressUpdateMany.mockResolvedValue({ count: 1 }); mock.auditCreate.mockResolvedValue({ id: randomUUID() }); mock.queryRaw.mockResolvedValue([]);
  });
  function token(role: UserRole) { const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: randomUUID(), name: role, email: `${role.toLowerCase()}@example.com`, role, active: true }; mock.userFindUnique.mockResolvedValue(user); return createAccessToken(user.id, role); }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('%s lista e visualiza endereços', async (role) => {
    const auth = token(role); const list = await fetch(`${baseUrl}/api/clients/${clientId}/addresses`, { headers: { Authorization: `Bearer ${auth}` } }); const detail = await fetch(`${baseUrl}/api/clients/${clientId}/addresses/${addressId}`, { headers: { Authorization: `Bearer ${auth}` } }); expect(list.status).toBe(200); expect(detail.status).toBe(200);
  });
  it.each([UserRole.ADMIN, UserRole.ANALISTA])('%s cria e edita endereço', async (role) => {
    mock.addressCount.mockResolvedValue(0); const auth = token(role); const body = JSON.stringify({ type: 'RESIDENTIAL', zipCode: '89200-000', street: 'Rua A', number: '221B', district: 'Centro', city: 'Joinville', state: 'SC', country: 'Brasil', isPrimary: false });
    const create = await fetch(`${baseUrl}/api/clients/${clientId}/addresses`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body });
    const update = await fetch(`${baseUrl}/api/clients/${clientId}/addresses/${addressId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'Curitiba' }) });
    expect(create.status).toBe(201); expect(update.status).toBe(200);
  });
  it('VISUALIZADOR recebe 403 para criar, editar e promover', async () => {
    const auth = token(UserRole.VISUALIZADOR); const headers = { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' };
    expect((await fetch(`${baseUrl}/api/clients/${clientId}/addresses`, { method: 'POST', headers, body: '{}' })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/clients/${clientId}/addresses/${addressId}`, { method: 'PATCH', headers, body: '{}' })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/clients/${clientId}/addresses/${addressId}/primary`, { method: 'PATCH', headers })).status).toBe(403);
  });
  it('somente ADMIN altera status; ADMIN e ANALISTA promovem principal', async () => {
    for (const role of [UserRole.ADMIN, UserRole.ANALISTA]) { mock.addressFindFirst.mockResolvedValue({ ...address, isPrimary: false }); const response = await fetch(`${baseUrl}/api/clients/${clientId}/addresses/${addressId}/primary`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(role)}` } }); expect(response.status).toBe(200); }
    for (const role of [UserRole.ANALISTA, UserRole.VISUALIZADOR]) { const response = await fetch(`${baseUrl}/api/clients/${clientId}/addresses/${addressId}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) }); expect(response.status).toBe(403); }
  });
  it('rejeita street vazio e parâmetros inválidos', async () => {
    const auth = token(UserRole.ADMIN); const invalid = await fetch(`${baseUrl}/api/clients/${clientId}/addresses`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'RESIDENTIAL', zipCode: '12345', street: '', number: '10', district: 'Centro', city: 'Miami', state: 'FL', country: 'Estados Unidos' }) });
    const query = await fetch(`${baseUrl}/api/clients/${clientId}/addresses?page=0`, { headers: { Authorization: `Bearer ${auth}` } }); expect(invalid.status).toBe(400); expect(query.status).toBe(400);
  });
});
