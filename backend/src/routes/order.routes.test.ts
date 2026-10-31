import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { OrderStatus, Prisma, UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userFindUnique: vi.fn(), list: vi.fn(), findById: vi.fn(), transaction: vi.fn(),
  findClient: vi.fn(), findProducts: vi.fn(), registerSale: vi.fn(), registerCancellation: vi.fn(), reserveSale: vi.fn(), releaseOrderReservations: vi.fn(), isOrderFulfilled: vi.fn(), nextOrderNumber: vi.fn(),
  createOrder: vi.fn(), lockOrder: vi.fn(), transactionFindOrder: vi.fn(), updateOrderStatus: vi.fn(), createReceivables: vi.fn(),
  logAudit: vi.fn(),
}));
vi.mock('../config/prisma.js', () => ({ prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() } }));
vi.mock('../repositories/order.repository.js', () => ({ PrismaOrderRepository: class {
  list = mock.list; findById = mock.findById;
  transaction = mock.transaction;
} }));
import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de pedidos', () => {
  let server: Server; let baseUrl: string; let clientId: string; let productId: string; let order: ReturnType<typeof makeOrder>;
  function makeOrder() { const now = new Date(); return { id: randomUUID(), number: 'PED-000006', clientId,
    client: { id: clientId, name: 'Carlos', document: '123', email: 'carlos@teste.local' }, status: OrderStatus.PENDING,
    total: new Prisma.Decimal('100.00'), paymentInstallments: 1, firstPaymentDueDays: 30, paymentIntervalDays: 30, receivables: [], createdAt: now, updatedAt: now,
    items: [{ id: randomUUID(), productId, productName: 'Produto', productSku: 'PROD001', quantity: 1, unitPrice: new Prisma.Decimal('100.00'), subtotal: new Prisma.Decimal('100.00') }] }; }
  beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou'); baseUrl = `http://127.0.0.1:${address.port}`; });
  beforeEach(() => {
    Object.values(mock).forEach((item) => item.mockReset()); clientId = randomUUID(); productId = randomUUID(); order = makeOrder();
    mock.list.mockResolvedValue({ orders: [{ ...order, itemsCount: 1 }], total: 1 }); mock.findById.mockResolvedValue(order);
    mock.findClient.mockResolvedValue({ id: clientId, active: true }); mock.findProducts.mockResolvedValue([{ id: productId, name: 'Produto', sku: 'PROD001', price: new Prisma.Decimal('100.00'), stock: 2, active: true }]);
    mock.reserveSale.mockResolvedValue(undefined); mock.releaseOrderReservations.mockResolvedValue(true); mock.isOrderFulfilled.mockResolvedValue(true); mock.nextOrderNumber.mockResolvedValue(order.number); mock.createOrder.mockResolvedValue(order);
    mock.lockOrder.mockResolvedValue(true); mock.transactionFindOrder.mockResolvedValue(order); mock.updateOrderStatus.mockResolvedValue({ ...order, status: OrderStatus.CONFIRMED });
    mock.createReceivables.mockResolvedValue([]); mock.logAudit.mockResolvedValue(undefined);
    mock.transaction.mockImplementation((operation: (transaction: unknown) => unknown) => operation({ findClient: mock.findClient, findProducts: mock.findProducts, registerSale: mock.registerSale, registerCancellation: mock.registerCancellation, reserveSale: mock.reserveSale, releaseOrderReservations: mock.releaseOrderReservations, isOrderFulfilled: mock.isOrderFulfilled, nextOrderNumber: mock.nextOrderNumber, createOrder: mock.createOrder, lockOrder: mock.lockOrder, findOrderById: mock.transactionFindOrder, updateOrderStatus: mock.updateOrderStatus, createReceivables: mock.createReceivables, logAudit: mock.logAudit }));
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  function token(role: UserRole) { const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: randomUUID(), name: role, email: `${role.toLowerCase()}@qamgmt.local`, role, active: true }; mock.userFindUnique.mockResolvedValue(user); return createAccessToken(user.id, role); }
  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('lista e detalha para %s', async (role) => { const auth = token(role); const list = await fetch(`${baseUrl}/api/orders?status=PENDING&sortBy=total&sortOrder=desc`, { headers: { Authorization: `Bearer ${auth}` } }); const details = await fetch(`${baseUrl}/api/orders/${order.id}`, { headers: { Authorization: `Bearer ${auth}` } }); expect(list.status).toBe(200); expect(details.status).toBe(200); });
  it.each([UserRole.ADMIN, UserRole.ANALISTA])('cria para %s sem aceitar preço do frontend', async (role) => { const response = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, items: [{ productId, quantity: 1 }] }) }); expect(response.status).toBe(201); expect(mock.createOrder).toHaveBeenCalledWith(expect.objectContaining({ total: expect.any(Prisma.Decimal) })); });
  it('nega criação ao VISUALIZADOR e valida quantidade', async () => { const viewer = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.VISUALIZADOR)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, items: [{ productId, quantity: 1 }] }) }); const invalid = await fetch(`${baseUrl}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, items: [{ productId, quantity: 0 }] }) }); expect(viewer.status).toBe(403); expect(invalid.status).toBe(400); });
  it('permite avanço a ADMIN e ANALISTA, mas nega VISUALIZADOR', async () => { for (const role of [UserRole.ADMIN, UserRole.ANALISTA]) { const response = await fetch(`${baseUrl}/api/orders/${order.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: OrderStatus.CONFIRMED }) }); expect(response.status).toBe(200); } const viewer = await fetch(`${baseUrl}/api/orders/${order.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(UserRole.VISUALIZADOR)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: OrderStatus.CONFIRMED }) }); expect(viewer.status).toBe(403); });
  it('nega cancelamento ao ANALISTA', async () => { const response = await fetch(`${baseUrl}/api/orders/${order.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(UserRole.ANALISTA)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: OrderStatus.CANCELLED }) }); expect(response.status).toBe(403); expect((await response.json() as { error: { message: string } }).error.message).toBe('Apenas administradores podem cancelar pedidos.'); });
});
