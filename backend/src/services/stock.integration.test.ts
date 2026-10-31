import { randomUUID } from 'node:crypto';
import { OrderStatus, UserRole } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../config/prisma.js';
import { PrismaOrderRepository } from '../repositories/order.repository.js';
import { PrismaStockRepository } from '../repositories/stock.repository.js';
import { auditLogger } from './audit.service.js';
import { OrderService } from './order.service.js';
import { StockService } from './stock.service.js';

describe.skipIf(process.env.RUN_DB_INTEGRATION !== '1')('StockService com PostgreSQL real', () => {
  const service = new StockService(new PrismaStockRepository(), auditLogger);
  const productIds: string[] = []; const orderIds: string[] = []; const clientIds: string[] = [];
  afterAll(async () => {
    if (orderIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (productIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: productIds } } });
      await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (clientIds.length > 0) await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.$disconnect();
  });

  it('CT022 e RF034: duas saídas simultâneas nunca deixam o saldo negativo', async () => {
    const actor = await prisma.user.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const category = await prisma.category.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const product = await prisma.product.create({ data: {
      name: 'Teste concorrência estoque', sku: `STOCK-${randomUUID()}`, price: '1.00', stock: 5, categoryId: category.id, active: true,
    } });
    productIds.push(product.id);
    await service.registerInitialBalance(product, actor.id);
    const outcomes = await Promise.allSettled([
      service.removeStock(product.id, { quantity: 4, reason: 'Concorrência A' }, actor.id),
      service.removeStock(product.id, { quantity: 4, reason: 'Concorrência B' }, actor.id),
    ]);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { stock: true } });
    const movements = await prisma.stockMovement.findMany({ where: { productId: product.id }, orderBy: { createdAt: 'asc' } });
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(stored.stock).toBe(1);
    expect(movements.map((movement) => movement.type)).toEqual(['INITIAL_BALANCE', 'EXIT']);
    expect(movements.at(-1)?.newStock).toBe(stored.stock);
    expect(movements.every((movement) => movement.quantity > 0 && movement.newStock >= 0)).toBe(true);
  }, 20_000);

  it('CT015-020: pedido real cria SALE e cancelamento devolve saldo uma única vez', async () => {
    const actor = await prisma.user.findFirstOrThrow({ where: { role: UserRole.ADMIN, active: true }, select: { id: true } });
    const client = await prisma.client.create({ data: { name: 'Cliente teste estoque', document: `DOC-${randomUUID()}`, email: `${randomUUID()}@teste.local`, active: true } });
    clientIds.push(client.id);
    const category = await prisma.category.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const product = await prisma.product.create({ data: { name: 'Produto pedido estoque', sku: `ORDER-STOCK-${randomUUID()}`, price: '25.00', stock: 6, categoryId: category.id, active: true } });
    productIds.push(product.id); await service.registerInitialBalance(product, actor.id);
    const orders = new OrderService(new PrismaOrderRepository(auditLogger, service));
    const order = await orders.create({ clientId: client.id, items: [{ productId: product.id, quantity: 2 }] }, actor.id);
    orderIds.push(order.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(4);
    expect(await prisma.stockMovement.count({ where: { orderId: order.id, type: 'SALE' } })).toBe(1);
    await orders.updateStatus(order.id, OrderStatus.CANCELLED, UserRole.ADMIN, actor.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(6);
    expect(await prisma.stockMovement.count({ where: { orderId: order.id, type: 'ORDER_CANCELLATION' } })).toBe(1);
    await expect(orders.updateStatus(order.id, OrderStatus.CANCELLED, UserRole.ADMIN, actor.id)).rejects.toMatchObject({ code: 'ORDER_ALREADY_CANCELLED' });
    expect(await prisma.stockMovement.count({ where: { orderId: order.id, type: 'ORDER_CANCELLATION' } })).toBe(1);
  }, 20_000);
});
