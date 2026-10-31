import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { OrderStatus, UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ userFindUnique: vi.fn(), load: vi.fn() }));

vi.mock('../config/prisma.js', () => ({
  prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() },
}));
vi.mock('../repositories/dashboard.repository.js', () => ({
  PrismaDashboardRepository: class { load = mock.load; },
}));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rota do dashboard', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mock.load.mockResolvedValue({
      activeClients: 3, activeProducts: 4, outOfStockProducts: 1,
      orderGroups: [{ status: OrderStatus.COMPLETED, _count: { _all: 1 } }],
      completedRevenue: null, recentOrders: [], lowStockProducts: [], dailyOrders: [],
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  function token(role: UserRole): string {
    const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = {
      id: randomUUID(), name: role, email: `${role.toLowerCase()}@qamgmt.local`, role, active: true,
    };
    mock.userFindUnique.mockResolvedValue(user);
    return createAccessToken(user.id, role);
  }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])(
    'permite consultar o resumo para %s',
    async (role) => {
      const response = await fetch(`${baseUrl}/api/dashboard/summary`, {
        headers: { Authorization: `Bearer ${token(role)}` },
      });
      const body = await response.json() as { clients: { active: number }; orders: { completed: number } };
      expect(response.status).toBe(200);
      expect(body.clients.active).toBe(3);
      expect(body.orders.completed).toBe(1);
    },
  );

  it('exige autenticação', async () => {
    const response = await fetch(`${baseUrl}/api/dashboard/summary`);
    expect(response.status).toBe(401);
    expect(mock.load).not.toHaveBeenCalled();
  });
});
