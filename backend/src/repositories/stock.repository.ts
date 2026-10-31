import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { AuditTransaction } from '../services/audit.service.js';
import type { CreateStockMovementData, ListStockMovementsInput, StockChange, StockMovementView, StockProduct } from '../types/stock.js';

const movementSelect = {
  id: true, productId: true, type: true, quantity: true, previousStock: true, newStock: true,
  reason: true, orderId: true, createdById: true, createdAt: true,
  order: { select: { id: true, number: true } },
  purchaseOrderId: true, purchaseReceiptId: true,
  purchaseOrder: { select: { id: true, number: true } },
  purchaseReceipt: { select: { id: true, number: true } },
  returnProcessId: true, returnItemId: true,
  returnProcess: { select: { id: true, number: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.StockMovementSelect;

export interface StockRepository {
  transaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  findProduct(id: string, transaction?: AuditTransaction): Promise<StockProduct | null>;
  increase(id: string, quantity: number, transaction: Prisma.TransactionClient): Promise<StockChange | null>;
  decrease(id: string, quantity: number, requireActive: boolean, transaction: Prisma.TransactionClient): Promise<StockChange | null>;
  setStock(id: string, newStock: number, transaction: Prisma.TransactionClient): Promise<StockChange | null>;
  createMovement(data: CreateStockMovementData, transaction?: AuditTransaction): Promise<StockMovementView>;
  createInitialBalances(products: Array<{ id: string; stock: number }>, createdById: string | undefined, transaction?: AuditTransaction): Promise<number>;
  list(input: ListStockMovementsInput): Promise<{ movements: StockMovementView[]; total: number }>;
}

export class PrismaStockRepository implements StockRepository {
  async transaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito de concorrência. Tente novamente.', 409, 'STOCK_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito de concorrência. Tente novamente.', 409, 'STOCK_CONCURRENCY_CONFLICT');
  }

  findProduct(id: string, transaction?: AuditTransaction): Promise<StockProduct | null> {
    return (transaction ?? prisma).product.findUnique({ where: { id }, select: { id: true, name: true, sku: true, stock: true, active: true } });
  }

  async increase(id: string, quantity: number, transaction: Prisma.TransactionClient): Promise<StockChange | null> {
    try {
      const current = await transaction.product.update({ where: { id }, data: { stock: { increment: quantity } }, select: { stock: true } });
      return { previousStock: current.stock - quantity, newStock: current.stock };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null;
      throw error;
    }
  }

  async decrease(id: string, quantity: number, requireActive: boolean, transaction: Prisma.TransactionClient): Promise<StockChange | null> {
    const result = await transaction.product.updateMany({
      where: { id, stock: { gte: quantity }, ...(requireActive ? { active: true } : {}) },
      data: { stock: { decrement: quantity } },
    });
    if (result.count !== 1) return null;
    const product = await transaction.product.findUniqueOrThrow({ where: { id }, select: { stock: true } });
    return { previousStock: product.stock + quantity, newStock: product.stock };
  }

  async setStock(id: string, newStock: number, transaction: Prisma.TransactionClient): Promise<StockChange | null> {
    const rows = await transaction.$queryRaw<Array<{ stock: number }>>`SELECT "stock" FROM "products" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const previousStock = rows[0]?.stock;
    if (previousStock === undefined) return null;
    await transaction.product.update({ where: { id }, data: { stock: newStock } });
    return { previousStock, newStock };
  }

  createMovement(data: CreateStockMovementData, transaction?: AuditTransaction): Promise<StockMovementView> {
    return (transaction ?? prisma).stockMovement.create({ data: {
      productId: data.productId, type: data.type, quantity: data.quantity,
      previousStock: data.previousStock, newStock: data.newStock,
      ...(data.reason !== undefined ? { reason: data.reason } : {}),
      ...(data.orderId !== undefined ? { orderId: data.orderId } : {}),
      ...(data.purchaseOrderId !== undefined ? { purchaseOrderId: data.purchaseOrderId } : {}),
      ...(data.purchaseReceiptId !== undefined ? { purchaseReceiptId: data.purchaseReceiptId } : {}),
      ...(data.returnProcessId !== undefined ? { returnProcessId: data.returnProcessId } : {}),
      ...(data.returnItemId !== undefined ? { returnItemId: data.returnItemId } : {}),
      ...(data.createdById !== undefined ? { createdById: data.createdById } : {}),
    }, select: movementSelect });
  }

  async createInitialBalances(products: Array<{ id: string; stock: number }>, createdById: string | undefined, transaction?: AuditTransaction): Promise<number> {
    const positive = products.filter((product) => product.stock > 0);
    if (positive.length === 0) return 0;
    const result = await (transaction ?? prisma).stockMovement.createMany({ data: positive.map((product) => ({
      productId: product.id, type: 'INITIAL_BALANCE', quantity: product.stock,
      previousStock: 0, newStock: product.stock,
      reason: 'Saldo inicial do produto', ...(createdById ? { createdById } : {}),
    })) });
    return result.count;
  }

  async list(input: ListStockMovementsInput): Promise<{ movements: StockMovementView[]; total: number }> {
    const where: Prisma.StockMovementWhereInput = {
      productId: input.productId,
      ...(input.type ? { type: input.type } : {}),
      ...(input.createdById ? { createdById: input.createdById } : {}),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.purchaseOrderId ? { purchaseOrderId: input.purchaseOrderId } : {}),
      ...(input.reason ? { reason: { contains: input.reason, mode: 'insensitive' } } : {}),
      ...(input.dateFrom || input.dateTo ? { createdAt: {
        ...(input.dateFrom ? { gte: input.dateFrom } : {}), ...(input.dateTo ? { lte: input.dateTo } : {}),
      } } : {}),
    };
    const [movements, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({ where, orderBy: [{ createdAt: input.sortOrder }, { id: input.sortOrder }],
        skip: (input.page - 1) * input.pageSize, take: input.pageSize, select: movementSelect }),
      prisma.stockMovement.count({ where }),
    ]);
    return { movements, total };
  }
}
