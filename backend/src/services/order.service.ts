import { AuditAction, AuditEntity, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { OrderRepository } from '../repositories/order.repository.js';
import type { CreateOrderInput, ListOrdersQuery } from '../schemas/order.schema.js';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PENDING]: OrderStatus.CONFIRMED,
  [OrderStatus.CONFIRMED]: OrderStatus.PROCESSING,
  [OrderStatus.PROCESSING]: OrderStatus.COMPLETED,
};

export class OrderService {
  constructor(private readonly orders: OrderRepository) {}

  async list(query: ListOrdersQuery) {
    const { orders, total } = await this.orders.list(query);
    return { data: orders, pagination: {
      page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
    } };
  }

  async getById(id: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new AppError('Pedido não encontrado.', 404, 'ORDER_NOT_FOUND');
    return order;
  }

  create(input: CreateOrderInput, actorUserId: string) {
    return this.orders.transaction(async (transaction) => {
      const paymentInstallments = input.paymentInstallments ?? 1;
      const firstPaymentDueDays = input.firstPaymentDueDays ?? 30;
      const paymentIntervalDays = input.paymentIntervalDays ?? 30;
      const client = await transaction.findClient(input.clientId);
      if (!client) throw new AppError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND');
      if (!client.active) throw new AppError('O cliente selecionado está inativo.', 409, 'CLIENT_INACTIVE');

      const requestedIds = input.items.map((item) => item.productId);
      const products = await transaction.findProducts(requestedIds);
      const productsById = new Map(products.map((product) => [product.id, product]));
      const orderItems = input.items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
        if (!product.active) throw new AppError('O produto selecionado está inativo.', 409, 'PRODUCT_INACTIVE');
        const subtotal = product.price.mul(item.quantity);
        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          quantity: item.quantity,
          unitPrice: product.price,
          subtotal,
        };
      });

      const total = orderItems.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
      const number = await transaction.nextOrderNumber();
      const created = await transaction.createOrder({ number, clientId: input.clientId, total, paymentInstallments,
        firstPaymentDueDays, paymentIntervalDays, items: orderItems });
      for (const item of [...created.items].sort((left, right) => left.productId.localeCompare(right.productId))) {
        await transaction.reserveSale(item.productId, item.quantity, created.id, item.id, actorUserId);
      }
      await transaction.logAudit({
        userId: actorUserId,
        entityType: AuditEntity.ORDER,
        entityId: created.id,
        action: AuditAction.CREATE,
        newData: { number: created.number, clientId: created.clientId, total: created.total, status: created.status,
          paymentInstallments: created.paymentInstallments, firstPaymentDueDays: created.firstPaymentDueDays, paymentIntervalDays: created.paymentIntervalDays },
      });
      return created;
    });
  }

  updateStatus(id: string, targetStatus: OrderStatus, role: UserRole, actorUserId: string) {
    return this.orders.transaction(async (transaction) => {
      if (!await transaction.lockOrder(id)) throw new AppError('Pedido não encontrado.', 404, 'ORDER_NOT_FOUND');
      const order = await transaction.findOrderById(id);
      if (!order) throw new AppError('Pedido não encontrado.', 404, 'ORDER_NOT_FOUND');

      if (targetStatus === OrderStatus.CANCELLED) {
        if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem cancelar pedidos.', 403, 'ORDER_CANCEL_FORBIDDEN');
        if (order.status === OrderStatus.COMPLETED) throw new AppError('Pedidos concluídos não podem ser cancelados.', 409, 'COMPLETED_ORDER_CANNOT_BE_CANCELLED');
        if (order.status === OrderStatus.CANCELLED) throw new AppError('O pedido já está cancelado.', 409, 'ORDER_ALREADY_CANCELLED');
        const cancellableStatuses: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
        if (!cancellableStatuses.includes(order.status)) {
          throw new AppError('Este pedido não pode mais ser cancelado.', 409, 'ORDER_CANNOT_BE_CANCELLED');
        }
        const cancelled = await transaction.updateOrderStatus(id, OrderStatus.CANCELLED);
        const released = await transaction.releaseOrderReservations(id, actorUserId);
        if (!released) for (const item of [...order.items].sort((left, right) => left.productId.localeCompare(right.productId))) await transaction.registerCancellation(item.productId, item.quantity, id, actorUserId);
        await transaction.logAudit({
          userId: actorUserId,
          entityType: AuditEntity.ORDER,
          entityId: id,
          action: AuditAction.CANCEL,
          oldData: { status: order.status },
          newData: { status: cancelled.status },
        });
        return cancelled;
      }

      const nextStatus = NEXT_STATUS[order.status];
      if (!nextStatus || targetStatus !== nextStatus) {
        throw new AppError('Transição de status inválida.', 409, 'INVALID_ORDER_STATUS_TRANSITION');
      }
      if (targetStatus === OrderStatus.COMPLETED && !await transaction.isOrderFulfilled(id)) throw new AppError('O pedido só pode ser concluído após a expedição integral.', 409, 'ORDER_NOT_FULLY_SHIPPED');
      const updated = await transaction.updateOrderStatus(id, targetStatus);
      const receivables = targetStatus === OrderStatus.COMPLETED ? await transaction.createReceivables(updated, actorUserId) : [];
      await transaction.logAudit({
        userId: actorUserId,
        entityType: AuditEntity.ORDER,
        entityId: id,
        action: AuditAction.STATUS_CHANGE,
        oldData: { status: order.status },
        newData: { status: updated.status, ...(receivables.length ? { receivables } : {}) },
      });
      return await transaction.findOrderById(id) ?? updated;
    });
  }
}
