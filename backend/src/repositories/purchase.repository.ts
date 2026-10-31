import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { ListPurchasesInput } from '../types/purchase.js';

export const purchaseInclude = {
  supplier: { select: { id: true, name: true, document: true, email: true, active: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  items: { orderBy: { productName: 'asc' as const }, include: { product: { select: { stock: true, active: true, trackingMode: true, expiryWarningDays: true, blockExpired: true } } } },
  receipts: { orderBy: { receivedAt: 'desc' as const }, include: {
    receivedBy: { select: { id: true, name: true, email: true } },
    items: { orderBy: { productName: 'asc' as const } },
    payables: { orderBy: { installmentNumber: 'asc' as const } },
  } },
  payables: { orderBy: [{ dueDate: 'asc' as const }, { installmentNumber: 'asc' as const }] },
  approvalEvents: {
    orderBy: { createdAt: 'desc' as const },
    include: { actor: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.PurchaseOrderInclude;

export class PrismaPurchaseRepository {
  async list(input: ListPurchasesInput) {
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(input.search ? { OR: [
        { number: { contains: input.search, mode: 'insensitive' } },
        { supplier: { is: { name: { contains: input.search, mode: 'insensitive' } } } },
        { supplier: { is: { document: { contains: input.search, mode: 'insensitive' } } } },
      ] } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.dateFrom || input.dateTo ? { createdAt: { ...(input.dateFrom ? { gte: input.dateFrom } : {}), ...(input.dateTo ? { lte: input.dateTo } : {}) } } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.purchaseOrder.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize,
        take: input.pageSize, include: { supplier: { select: { id: true, name: true, document: true } }, _count: { select: { items: true, receipts: true } } } }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return { records: records.map(({ _count, ...record }) => ({ ...record, itemsCount: _count.items, receiptsCount: _count.receipts })), total };
  }
  findById(id: string) { return prisma.purchaseOrder.findUnique({ where: { id }, include: purchaseInclude }); }
  listApprovalRules() {
    return prisma.purchaseApprovalRule.findMany({
      orderBy: { role: 'asc' },
      include: { updatedBy: { select: { id: true, name: true, email: true } } },
    });
  }
  async costHistory(productId: string, page: number, pageSize: number) {
    const where: Prisma.PurchaseReceiptItemWhereInput = { productId };
    const [records, total] = await prisma.$transaction([
      prisma.purchaseReceiptItem.findMany({ where, orderBy: { receipt: { receivedAt: 'desc' } }, skip: (page - 1) * pageSize, take: pageSize,
        include: { receipt: { select: { id: true, number: true, receivedAt: true, purchaseOrder: { select: { id: true, number: true, supplier: { select: { id: true, name: true } } } } } } } }),
      prisma.purchaseReceiptItem.count({ where }),
    ]);
    return { records, total };
  }
  async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito no recebimento. Tente novamente.', 409, 'PURCHASE_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito no recebimento. Tente novamente.', 409, 'PURCHASE_CONCURRENCY_CONFLICT');
  }
}
