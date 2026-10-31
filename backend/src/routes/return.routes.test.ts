import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userFindUnique: vi.fn(), list: vi.fn(), getById: vi.fn(), create: vi.fn(), listReasons: vi.fn(), createReason: vi.fn(), updateReason: vi.fn(),
  submit: vi.fn(), startReview: vi.fn(), approve: vi.fn(), reject: vi.fn(), cancel: vi.fn(), confirmPhysical: vi.fn(), inspectItem: vi.fn(),
  linkAdjustment: vi.fn(), approveAdjustment: vi.fn(), settleAdjustment: vi.fn(), linkFiscal: vi.fn(), addAttachment: vi.fn(), downloadAttachment: vi.fn(), removeAttachment: vi.fn(),
}));
vi.mock('../config/prisma.js', () => ({ prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() } }));
vi.mock('../services/return.service.js', () => ({ ReturnService: class {
  list = mock.list; getById = mock.getById; create = mock.create; listReasons = mock.listReasons; createReason = mock.createReason; updateReason = mock.updateReason;
  submit = mock.submit; startReview = mock.startReview; approve = mock.approve; reject = mock.reject; cancel = mock.cancel; confirmPhysical = mock.confirmPhysical; inspectItem = mock.inspectItem;
  linkAdjustment = mock.linkAdjustment; approveAdjustment = mock.approveAdjustment; settleAdjustment = mock.settleAdjustment; linkFiscal = mock.linkFiscal;
  addAttachment = mock.addAttachment; downloadAttachment = mock.downloadAttachment; removeAttachment = mock.removeAttachment;
} }));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de devoluções e trocas', () => {
  let server: Server; let baseUrl: string; const actorId = randomUUID(); const returnId = randomUUID();
  beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.'); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  beforeEach(() => { Object.values(mock).forEach((entry) => entry.mockReset()); mock.list.mockResolvedValue({ data: [], summary: {}, pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }); mock.listReasons.mockResolvedValue([]); mock.create.mockResolvedValue({ id: returnId }); mock.getById.mockResolvedValue({ id: returnId }); mock.approve.mockResolvedValue({ id: returnId }); mock.confirmPhysical.mockResolvedValue({ id: returnId }); });
  function token(role: UserRole): string { const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: actorId, name: role, email: `${role.toLowerCase()}@teste.com`, role, active: true }; mock.userFindUnique.mockResolvedValue(user); return createAccessToken(actorId, role); }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('%s consulta operações e motivos', async (role) => {
    const auth = token(role); expect((await fetch(`${baseUrl}/api/returns`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200); expect((await fetch(`${baseUrl}/api/returns/reasons`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200);
  });

  it.each([UserRole.ADMIN, UserRole.ANALISTA])('%s registra rascunho', async (role) => {
    const response = await fetch(`${baseUrl}/api/returns`, { method: 'POST', headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
      type: 'CUSTOMER_RETURN', orderId: randomUUID(), reasonId: randomUUID(), financialTreatment: 'CUSTOMER_REFUND', items: [{ sourceItemId: randomUUID(), quantity: 1 }],
    }) });
    expect(response.status).toBe(201); expect(mock.create).toHaveBeenCalled();
  });

  it('bloqueia mutações para visualizador', async () => {
    const response = await fetch(`${baseUrl}/api/returns`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.VISUALIZADOR)}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(403);
  });

  it('restringe aprovação ao administrador e permite confirmação física ao analista', async () => {
    expect((await fetch(`${baseUrl}/api/returns/${returnId}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ANALISTA)}`, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/returns/${returnId}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}`, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/returns/${returnId}/physical-confirmation`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ANALISTA)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }) })).status).toBe(200);
  });

  it('valida payload e exige autenticação', async () => {
    const response = await fetch(`${baseUrl}/api/returns`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'EXCHANGE', orderId: randomUUID(), reasonId: randomUUID(), items: [] }) });
    expect(response.status).toBe(400);
    expect((await fetch(`${baseUrl}/api/returns`)).status).toBe(401);
  });
});
