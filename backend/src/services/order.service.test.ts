import { AuditAction, AuditEntity, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OrderRepository, OrderTransaction } from '../repositories/order.repository.js';
import type { CreateOrderData, ListOrdersInput, ManagedOrder, OrderSummary, TransactionClient, TransactionProduct } from '../types/order.js';
import { OrderService } from './order.service.js';
import type { AuditLogInput } from '../types/audit.js';

interface FakeClient extends TransactionClient { name: string; document: string; email: string }

class InMemoryOrders implements OrderRepository {
  clients = new Map<string, FakeClient>();
  products = new Map<string, TransactionProduct>();
  records: ManagedOrder[] = [];
  sequence = 0;
  failCreation = false;
  failAudit = false;
  audits: AuditLogInput[] = [];
  movements: Array<{ type: 'SALE' | 'ORDER_CANCELLATION'; productId: string; quantity: number; orderId: string }> = [];
  failMovementProductId = '';
  private queue: Promise<void> = Promise.resolve();

  async list(_input: ListOrdersInput): Promise<{ orders: OrderSummary[]; total: number }> {
    return { orders: this.records.map((order) => ({ ...order, itemsCount: order.items.length })), total: this.records.length };
  }
  async findById(id: string) { return this.records.find((order) => order.id === id) ?? null; }

  transaction<T>(operation: (transaction: OrderTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const workingProducts = new Map([...this.products].map(([id, product]) => [id, { ...product, price: new Prisma.Decimal(product.price) }]));
      const workingRecords = this.records.map((order) => ({ ...order, items: order.items.map((item) => ({ ...item })) }));
      let workingSequence = this.sequence;
      const workingAudits = [...this.audits];
      const workingMovements = [...this.movements];
      const transaction: OrderTransaction = {
        findClient: async (id) => this.clients.get(id) ?? null,
        findProducts: async (ids) => ids.flatMap((id) => { const product = workingProducts.get(id); return product ? [product] : []; }),
        registerSale: async (id, quantity, orderId) => { const product = workingProducts.get(id); if (!product || !product.active) throw Object.assign(new Error('Produto inativo'), { code: 'PRODUCT_INACTIVE' }); if (product.stock < quantity) throw Object.assign(new Error(`Estoque insuficiente para o produto "${product.name}".`), { code: 'INSUFFICIENT_STOCK' }); product.stock -= quantity; if (id === this.failMovementProductId) throw new Error('Falha simulada na movimentação'); workingMovements.push({ type: 'SALE', productId: id, quantity, orderId }); },
        registerCancellation: async (id, quantity, orderId) => { const product = workingProducts.get(id); if (!product) throw new Error('Produto ausente'); product.stock += quantity; workingMovements.push({ type: 'ORDER_CANCELLATION', productId: id, quantity, orderId }); },
        reserveSale: async (id, quantity, orderId) => { const product = workingProducts.get(id); if (!product || !product.active) throw Object.assign(new Error('Produto inativo'), { code: 'PRODUCT_INACTIVE' }); if (product.stock < quantity) throw Object.assign(new Error(`Estoque insuficiente para o produto "${product.name}".`), { code: 'INSUFFICIENT_STOCK' }); product.stock -= quantity; if (id === this.failMovementProductId) throw new Error('Falha simulada na movimentação'); workingMovements.push({ type: 'SALE', productId: id, quantity, orderId }); },
        releaseOrderReservations: async (orderId) => { const movements = workingMovements.filter((item) => item.orderId === orderId && item.type === 'SALE'); for (const movement of movements) { const product = workingProducts.get(movement.productId); if (product) product.stock += movement.quantity; workingMovements.push({ type: 'ORDER_CANCELLATION', productId: movement.productId, quantity: movement.quantity, orderId }); } return movements.length > 0; },
        isOrderFulfilled: async () => true,
        nextOrderNumber: async () => `PED-${String(++workingSequence).padStart(6, '0')}`,
        createOrder: async (data: CreateOrderData) => {
          if (this.failCreation) throw new Error('Falha simulada');
          const client = this.clients.get(data.clientId)!; const now = new Date();
          const order: ManagedOrder = { id: randomUUID(), number: data.number, clientId: data.clientId,
            client: { id: client.id, name: client.name, document: client.document, email: client.email },
            status: OrderStatus.PENDING, total: data.total, paymentInstallments: data.paymentInstallments, firstPaymentDueDays: data.firstPaymentDueDays,
            paymentIntervalDays: data.paymentIntervalDays, receivables: [], createdAt: now, updatedAt: now,
            items: data.items.map((item) => ({ id: randomUUID(), ...item })) };
          workingRecords.push(order); return order;
        },
        lockOrder: async (id) => workingRecords.some((order) => order.id === id),
        findOrderById: async (id) => workingRecords.find((order) => order.id === id) ?? null,
        updateOrderStatus: async (id, status) => { const index = workingRecords.findIndex((order) => order.id === id); if (index < 0) throw new Error('Pedido ausente'); const updated = { ...workingRecords[index]!, status, updatedAt: new Date() }; workingRecords[index] = updated; return updated; },
        createReceivables: async (order) => { const documents = Array.from({ length: order.paymentInstallments }, (_, index) => ({ id: randomUUID(), number: `CR-${String(index + 1).padStart(6, '0')}`, installmentNumber: index + 1, amount: order.total.div(order.paymentInstallments), dueDate: new Date() })); order.receivables = documents.map((document) => ({ ...document, installmentCount: order.paymentInstallments, originalAmount: document.amount, receivedAmount: new Prisma.Decimal(0), status: 'PENDING' })); return documents; },
        logAudit: async (input) => { if (this.failAudit) throw new Error('Falha de auditoria simulada'); workingAudits.push(input); },
      };
      const result = await operation(transaction);
      this.products = workingProducts; this.records = workingRecords; this.sequence = workingSequence; this.audits = workingAudits; this.movements = workingMovements;
      return result;
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

describe('OrderService', () => {
  let repository: InMemoryOrders; let service: OrderService; let clientId: string; let productA: string; let productB: string; let actorId: string;
  beforeEach(() => {
    repository = new InMemoryOrders(); service = new OrderService(repository); clientId = randomUUID(); productA = randomUUID(); productB = randomUUID(); actorId = randomUUID();
    repository.clients.set(clientId, { id: clientId, name: 'Carlos Silva', document: '123', email: 'carlos@teste.local', active: true });
    repository.products.set(productA, { id: productA, name: 'Notebook', sku: 'NOTE001', price: new Prisma.Decimal('100.10'), stock: 5, active: true });
    repository.products.set(productB, { id: productB, name: 'Mouse', sku: 'MOUSE001', price: new Prisma.Decimal('20.25'), stock: 10, active: true });
  });

  it('cria pedido, calcula Decimal, preserva snapshots e reduz estoque', async () => {
    const order = await service.create({ clientId, items: [{ productId: productA, quantity: 2 }, { productId: productB, quantity: 3 }] }, actorId);
    expect(order.number).toBe('PED-000001'); expect(order.total.toString()).toBe('260.95');
    expect(order.items[0]).toMatchObject({ productName: 'Notebook', productSku: 'NOTE001', quantity: 2 });
    expect(repository.products.get(productA)?.stock).toBe(3); expect(repository.products.get(productB)?.stock).toBe(7);
    expect(repository.movements).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'SALE', productId: productA, quantity: 2 }), expect.objectContaining({ type: 'SALE', productId: productB, quantity: 3 })]));
    expect(repository.audits[0]).toMatchObject({ userId: actorId, entityType: AuditEntity.ORDER, entityId: order.id, action: AuditAction.CREATE, newData: expect.objectContaining({ number: 'PED-000001', status: OrderStatus.PENDING }) });
    repository.products.get(productA)!.price = new Prisma.Decimal('999.99');
    expect((await service.getById(order.id)).items[0]?.unitPrice.toString()).toBe('100.1');
  });

  it('rejeita cliente inexistente ou inativo', async () => {
    await expect(service.create({ clientId: randomUUID(), items: [{ productId: productA, quantity: 1 }] }, actorId)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    repository.clients.get(clientId)!.active = false;
    await expect(service.create({ clientId, items: [{ productId: productA, quantity: 1 }] }, actorId)).rejects.toMatchObject({ message: 'O cliente selecionado está inativo.' });
  });

  it('rejeita produto inexistente, inativo e estoque insuficiente', async () => {
    await expect(service.create({ clientId, items: [{ productId: randomUUID(), quantity: 1 }] }, actorId)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    repository.products.get(productA)!.active = false;
    await expect(service.create({ clientId, items: [{ productId: productA, quantity: 1 }] }, actorId)).rejects.toMatchObject({ message: 'O produto selecionado está inativo.' });
    repository.products.get(productA)!.active = true;
    await expect(service.create({ clientId, items: [{ productId: productA, quantity: 6 }] }, actorId)).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('faz rollback do estoque quando a criação falha', async () => {
    repository.failCreation = true;
    await expect(service.create({ clientId, items: [{ productId: productA, quantity: 2 }] }, actorId)).rejects.toThrow('Falha simulada');
    expect(repository.products.get(productA)?.stock).toBe(5); expect(repository.records).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
  });

  it('faz rollback da operação principal quando a auditoria falha', async () => {
    repository.failAudit = true;
    await expect(service.create({ clientId, items: [{ productId: productA, quantity: 2 }] }, actorId)).rejects.toThrow('Falha de auditoria simulada');
    expect(repository.products.get(productA)?.stock).toBe(5);
    expect(repository.records).toHaveLength(0);
    expect(repository.audits).toHaveLength(0);
    expect(repository.movements).toHaveLength(0);
  });

  it('CT021 e CT034: falha de movimentação no segundo item desfaz pedido, saldo e histórico', async () => {
    repository.failMovementProductId = productB;
    await expect(service.create({ clientId, items: [{ productId: productA, quantity: 2 }, { productId: productB, quantity: 1 }] }, actorId)).rejects.toThrow('Falha simulada na movimentação');
    expect(repository.records).toHaveLength(0); expect(repository.movements).toHaveLength(0);
    expect(repository.products.get(productA)?.stock).toBe(5); expect(repository.products.get(productB)?.stock).toBe(10);
  });

  it('serializa criações concorrentes e nunca deixa estoque negativo', async () => {
    const outcomes = await Promise.allSettled([
      service.create({ clientId, items: [{ productId: productA, quantity: 3 }] }, actorId),
      service.create({ clientId, items: [{ productId: productA, quantity: 3 }] }, actorId),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(repository.products.get(productA)?.stock).toBe(2);
  });

  it('aplica máquina de estados e rejeita transição arbitrária', async () => {
    const order = await service.create({ clientId, items: [{ productId: productA, quantity: 1 }] }, actorId);
    expect((await service.updateStatus(order.id, OrderStatus.CONFIRMED, UserRole.ANALISTA, actorId)).status).toBe(OrderStatus.CONFIRMED);
    expect((await service.updateStatus(order.id, OrderStatus.PROCESSING, UserRole.ANALISTA, actorId)).status).toBe(OrderStatus.PROCESSING);
    expect(repository.audits.slice(1, 3).map((entry) => entry.action)).toEqual([AuditAction.STATUS_CHANGE, AuditAction.STATUS_CHANGE]);
    await expect(service.updateStatus(order.id, OrderStatus.PENDING, UserRole.ADMIN, actorId)).rejects.toMatchObject({ code: 'INVALID_ORDER_STATUS_TRANSITION' });
    expect((await service.updateStatus(order.id, OrderStatus.COMPLETED, UserRole.ADMIN, actorId)).status).toBe(OrderStatus.COMPLETED);
    expect((await service.getById(order.id)).receivables).toHaveLength(1);
    await expect(service.updateStatus(order.id, OrderStatus.CANCELLED, UserRole.ADMIN, actorId)).rejects.toMatchObject({ code: 'COMPLETED_ORDER_CANNOT_BE_CANCELLED' });
  });

  it('cancela uma única vez, devolve estoque e restringe ao ADMIN', async () => {
    const order = await service.create({ clientId, items: [{ productId: productA, quantity: 2 }] }, actorId);
    await expect(service.updateStatus(order.id, OrderStatus.CANCELLED, UserRole.ANALISTA, actorId)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.products.get(productA)?.stock).toBe(3);
    expect((await service.updateStatus(order.id, OrderStatus.CANCELLED, UserRole.ADMIN, actorId)).status).toBe(OrderStatus.CANCELLED);
    expect(repository.products.get(productA)?.stock).toBe(5);
    expect(repository.movements.map((item) => item.type)).toEqual(['SALE', 'ORDER_CANCELLATION']);
    expect(repository.audits.at(-1)).toMatchObject({ userId: actorId, action: AuditAction.CANCEL, oldData: { status: OrderStatus.PENDING }, newData: { status: OrderStatus.CANCELLED } });
    await expect(service.updateStatus(order.id, OrderStatus.CANCELLED, UserRole.ADMIN, actorId)).rejects.toMatchObject({ code: 'ORDER_ALREADY_CANCELLED' });
    expect(repository.products.get(productA)?.stock).toBe(5);
    expect(repository.movements.filter((item) => item.type === 'ORDER_CANCELLATION')).toHaveLength(1);
  });
});
