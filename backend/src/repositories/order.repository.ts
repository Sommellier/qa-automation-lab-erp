import { Prisma, type OrderStatus } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { prisma } from '../config/prisma.js';
import type { CreateOrderData, ListOrdersInput, ManagedOrder, OrderSummary, TransactionClient, TransactionProduct } from '../types/order.js';
import type { AuditLogInput } from '../types/audit.js';
import type { AuditLogger } from '../services/audit.service.js';
import type { StockService } from '../services/stock.service.js';
import { buildPayableInstallments } from '../services/payable-installments.js';

const orderInclude = {
  client: { select: { id: true, name: true, document: true, email: true } },
  seller: { select: { id: true, name: true, email: true } },
  quote: { select: { id: true, number: true } },
  items: { orderBy: { productName: 'asc' as const }, select: {
    id: true, productId: true, productName: true, productSku: true, quantity: true, unitPrice: true, subtotal: true,
  } },
  receivables: { orderBy: { installmentNumber: 'asc' as const }, select: {
    id: true, number: true, installmentNumber: true, installmentCount: true, originalAmount: true, receivedAmount: true, dueDate: true, status: true,
  } },
  shipments: { orderBy: { shippedAt: 'desc' as const }, include: { createdBy: { select: { id: true, name: true, email: true } }, items: { include: { cogsEntry: true } } } },
  stockReservations: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export interface OrderTransaction {
  findClient(id: string): Promise<TransactionClient | null>;
  findProducts(ids: string[]): Promise<TransactionProduct[]>;
  registerSale(productId: string, quantity: number, orderId: string, actorUserId: string): Promise<void>;
  registerCancellation(productId: string, quantity: number, orderId: string, actorUserId: string): Promise<void>;
  reserveSale(productId: string, quantity: number, orderId: string, orderItemId: string, actorUserId: string): Promise<void>;
  releaseOrderReservations(orderId: string, actorUserId: string): Promise<boolean>;
  isOrderFulfilled(orderId: string): Promise<boolean>;
  nextOrderNumber(): Promise<string>;
  createOrder(data: CreateOrderData): Promise<ManagedOrder>;
  lockOrder(id: string): Promise<boolean>;
  findOrderById(id: string): Promise<ManagedOrder | null>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<ManagedOrder>;
  createReceivables(order: ManagedOrder, actorUserId: string): Promise<Array<{ id: string; number: string; installmentNumber: number; amount: Prisma.Decimal; dueDate: Date }>>;
  logAudit(input: AuditLogInput): Promise<void>;
}

export interface OrderRepository {
  list(input: ListOrdersInput): Promise<{ orders: OrderSummary[]; total: number }>;
  findById(id: string): Promise<ManagedOrder | null>;
  transaction<T>(operation: (transaction: OrderTransaction) => Promise<T>): Promise<T>;
}

class PrismaOrderTransaction implements OrderTransaction {
  constructor(private readonly transaction: Prisma.TransactionClient, private readonly audit: AuditLogger,
    private readonly stock: StockService) {}

  findClient(id: string): Promise<TransactionClient | null> {
    return this.transaction.client.findUnique({ where: { id }, select: { id: true, active: true } });
  }

  findProducts(ids: string[]): Promise<TransactionProduct[]> {
    return this.transaction.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, sku: true, price: true, stock: true, active: true },
    });
  }

  async registerSale(productId: string, quantity: number, orderId: string, actorUserId: string): Promise<void> {
    await this.stock.registerSale(this.transaction, productId, quantity, orderId, actorUserId);
  }

  async registerCancellation(productId: string, quantity: number, orderId: string, actorUserId: string): Promise<void> {
    await this.stock.registerCancellation(this.transaction, productId, quantity, orderId, actorUserId);
  }

  async reserveSale(productId: string, quantity: number, orderId: string, orderItemId: string, actorUserId: string): Promise<void> {
    await this.stock.reserveSale(this.transaction, productId, quantity, orderId, orderItemId, actorUserId);
  }

  releaseOrderReservations(orderId: string, actorUserId: string): Promise<boolean> {
    return this.stock.releaseOrderReservations(this.transaction, orderId, actorUserId);
  }

  isOrderFulfilled(orderId: string): Promise<boolean> {
    return this.stock.isOrderFulfilled(this.transaction, orderId);
  }

  async nextOrderNumber(): Promise<string> {
    const rows = await this.transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('order_number_seq') AS value`;
    const value = rows[0]?.value;
    if (value === undefined) throw new AppError('Não foi possível gerar o número do pedido.', 500, 'ORDER_NUMBER_ERROR');
    return `PED-${value.toString().padStart(6, '0')}`;
  }

  createOrder(data: CreateOrderData): Promise<ManagedOrder> {
    return this.transaction.order.create({
      data: {
        number: data.number,
        clientId: data.clientId,
        total: data.total,
        grossTotal: data.total,
        paymentInstallments: data.paymentInstallments,
        firstPaymentDueDays: data.firstPaymentDueDays,
        paymentIntervalDays: data.paymentIntervalDays,
        items: { create: data.items },
      },
      include: orderInclude,
    });
  }

  async lockOrder(id: string): Promise<boolean> {
    const rows = await this.transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return rows.length === 1;
  }

  findOrderById(id: string): Promise<ManagedOrder | null> {
    return this.transaction.order.findUnique({ where: { id }, include: orderInclude });
  }

  updateOrderStatus(id: string, status: OrderStatus): Promise<ManagedOrder> {
    return this.transaction.order.update({ where: { id }, data: { status }, include: orderInclude });
  }

  async createReceivables(order: ManagedOrder, actorUserId: string): Promise<Array<{ id: string; number: string; installmentNumber: number; amount: Prisma.Decimal; dueDate: Date }>> {
    const issuedAt = new Date();
    const installments = buildPayableInstallments(order.total, order.paymentInstallments, order.firstPaymentDueDays, order.paymentIntervalDays, issuedAt);
    const documents: Array<{ id: string; number: string; installmentNumber: number; amount: Prisma.Decimal; dueDate: Date }> = [];
    for (const installment of installments) {
      const sequence = await this.transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('receivable_number_seq') AS value`;
      const number = `CR-${sequence[0]!.value.toString().padStart(6, '0')}`;
      const receivable = await this.transaction.receivable.create({ data: { number, description: `Venda ${order.number}`,
        clientId: order.clientId, orderId: order.id, installmentNumber: installment.number, installmentCount: order.paymentInstallments,
        originalAmount: installment.amount, competenceDate: issuedAt, issueDate: issuedAt, dueDate: installment.dueDate, createdById: actorUserId } });
      documents.push({ id: receivable.id, number, installmentNumber: installment.number, amount: installment.amount, dueDate: installment.dueDate });
    }
    return documents;
  }

  logAudit(input: AuditLogInput): Promise<void> {
    return this.audit.log(input, this.transaction);
  }
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly audit: AuditLogger, private readonly stock: StockService) {}
  async list(input: ListOrdersInput): Promise<{ orders: OrderSummary[]; total: number }> {
    const clientSearch: Prisma.ClientWhereInput | undefined = input.client ? { OR: [
      { name: { contains: input.client, mode: 'insensitive' } },
      { document: { contains: input.client, mode: 'insensitive' } },
      { email: { contains: input.client, mode: 'insensitive' } },
    ] } : undefined;
    const where: Prisma.OrderWhereInput = {
      ...(input.search ? { OR: [
        { number: { contains: input.search, mode: 'insensitive' } },
        { client: { is: { OR: [
          { name: { contains: input.search, mode: 'insensitive' } },
          { document: { contains: input.search, mode: 'insensitive' } },
        ] } } },
      ] } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(clientSearch ? { client: { is: clientSearch } } : {}),
      ...(input.dateStart || input.dateEnd ? { createdAt: {
        ...(input.dateStart ? { gte: input.dateStart } : {}),
        ...(input.dateEnd ? { lte: input.dateEnd } : {}),
      } } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        orderBy: { [input.sortBy]: input.sortOrder },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          client: { select: { id: true, name: true, document: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
    return {
      orders: records.map(({ _count, ...order }) => ({ ...order, itemsCount: _count.items })),
      total,
    };
  }

  findById(id: string): Promise<ManagedOrder | null> {
    return prisma.order.findUnique({ where: { id }, include: orderInclude });
  }

  async transaction<T>(operation: (transaction: OrderTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(
          (transaction) => operation(new PrismaOrderTransaction(transaction, this.audit, this.stock)),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito de concorrência. Tente novamente.', 409, 'ORDER_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito de concorrência. Tente novamente.', 409, 'ORDER_CONCURRENCY_CONFLICT');
  }
}
