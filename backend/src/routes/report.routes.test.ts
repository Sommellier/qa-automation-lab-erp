import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { OrderStatus, Prisma, UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ userFindUnique: vi.fn(), clients: vi.fn(), products: vi.fn(), orders: vi.fn(), revenue: vi.fn() }));
vi.mock('../config/prisma.js', () => ({ prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() } }));
vi.mock('../repositories/report.repository.js', () => ({ PrismaReportRepository: class { clients = mock.clients; products = mock.products; orders = mock.orders; revenue = mock.revenue; } }));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de relatórios', () => {
  let server: Server; let baseUrl: string; const actorId = randomUUID(); const now = new Date('2026-09-27T12:00:00.000Z');
  beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.'); baseUrl = `http://127.0.0.1:${address.port}`; });
  beforeEach(() => {
    Object.values(mock).forEach((entry) => entry.mockReset());
    mock.clients.mockResolvedValue({ records: [], recordsTotal: 0, totalClients: 0, active: 0, inactive: 0, newInPeriod: 0 });
    mock.products.mockResolvedValue({ records: [], total: 0, active: 0, inactive: 0, outOfStock: 0, lowStock: 0, stockValue: new Prisma.Decimal(0) });
    mock.orders.mockResolvedValue({ records: [], total: 0, statusGroups: [], averageCompletedTicket: null });
    mock.revenue.mockResolvedValue({ totalRevenue: null, completedOrders: 0, averageTicket: null, largestOrder: null, smallestOrder: null, cancelledOrders: 0, cancelledValue: null, daily: [], topProducts: [], topClients: [] });
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  function token(role: UserRole): string { const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: actorId, name: role, email: `${role.toLowerCase()}@teste.com`, role, active: true }; mock.userFindUnique.mockResolvedValue(user); return createAccessToken(actorId, role); }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('permite relatório de clientes para %s', async (role) => {
    expect((await fetch(`${baseUrl}/api/reports/clients`, { headers: { Authorization: `Bearer ${token(role)}` } })).status).toBe(200);
  });
  it.each(['clients', 'products', 'orders', 'revenue'])('expõe GET /api/reports/%s', async (report) => {
    const response = await fetch(`${baseUrl}/api/reports/${report}`, { headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` } });
    expect(response.status).toBe(200);
  });
  it('rejeita ausência de autenticação e queries inválidas', async () => {
    expect((await fetch(`${baseUrl}/api/reports/clients`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/reports/orders?status=${OrderStatus.PENDING}&pageSize=101`, { headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` } })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/reports/revenue?dateFrom=2026-09-30&dateTo=2026-09-01`, { headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` } })).status).toBe(400);
  });
});
