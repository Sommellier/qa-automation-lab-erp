import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { ListReturnsInput } from '../types/return.js';

const person = { select: { id: true, name: true, email: true } } as const;

export const returnProcessInclude = {
  reason: true,
  supplier: { select: { id: true, name: true, document: true } },
  client: { select: { id: true, name: true, document: true } },
  purchaseOrder: { select: { id: true, number: true, status: true, total: true } },
  purchaseReceipt: { select: { id: true, number: true, receivedAt: true, total: true } },
  order: { select: { id: true, number: true, status: true, total: true } },
  createdBy: person,
  approvedBy: person,
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      product: { select: { id: true, name: true, sku: true, stock: true, active: true } },
      replacementProduct: { select: { id: true, name: true, sku: true, stock: true, active: true } },
      inspectedBy: person,
      stockMovements: { orderBy: { createdAt: 'asc' as const }, include: { createdBy: person } },
    },
  },
  financialAdjustments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      payable: { select: { id: true, number: true, originalAmount: true, paidAmount: true, status: true } },
      receivable: { select: { id: true, number: true, originalAmount: true, receivedAmount: true, status: true } },
      createdBy: person,
      approvedBy: person,
      settledBy: person,
    },
  },
  fiscalLinks: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      fiscalDocument: { select: { id: true, number: true, series: true, accessKey: true, operation: true, total: true, issueDate: true } },
      linkedBy: person,
    },
  },
  attachments: { orderBy: { createdAt: 'desc' as const }, include: { uploadedBy: person, removedBy: person } },
  history: { orderBy: { createdAt: 'asc' as const }, include: { actor: person } },
} satisfies Prisma.ReturnProcessInclude;

export class PrismaReturnRepository {
  async list(input: ListReturnsInput) {
    const where: Prisma.ReturnProcessWhereInput = {
      ...(input.search ? { OR: [
        { number: { contains: input.search, mode: 'insensitive' } },
        { purchaseOrder: { number: { contains: input.search, mode: 'insensitive' } } },
        { purchaseReceipt: { number: { contains: input.search, mode: 'insensitive' } } },
        { order: { number: { contains: input.search, mode: 'insensitive' } } },
        { supplier: { name: { contains: input.search, mode: 'insensitive' } } },
        { client: { name: { contains: input.search, mode: 'insensitive' } } },
      ] } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.productId ? { items: { some: { OR: [{ productId: input.productId }, { replacementProductId: input.productId }] } } } : {}),
      ...(input.dateFrom || input.dateTo ? { createdAt: { ...(input.dateFrom ? { gte: input.dateFrom } : {}), ...(input.dateTo ? { lte: input.dateTo } : {}) } } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.returnProcess.findMany({
        where,
        orderBy: [{ createdAt: input.sortOrder }, { id: input.sortOrder }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          reason: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
          order: { select: { id: true, number: true } },
          _count: { select: { items: true, stockMovements: true, financialAdjustments: true, fiscalLinks: true } },
        },
      }),
      prisma.returnProcess.count({ where }),
    ]);
    return { records, total };
  }

  findById(id: string) {
    return prisma.returnProcess.findUnique({ where: { id }, include: returnProcessInclude });
  }

  findAttachment(returnProcessId: string, attachmentId: string) {
    return prisma.returnAttachment.findFirst({ where: { id: attachmentId, returnProcessId, active: true } });
  }

  listReasons(includeInactive = false) {
    return prisma.returnReason.findMany({ where: includeInactive ? {} : { active: true }, orderBy: { name: 'asc' } });
  }

  async summary() {
    const [total, pending, awaitingInspection, awaitingFinancial, completed] = await prisma.$transaction([
      prisma.returnProcess.count(),
      prisma.returnProcess.count({ where: { status: { in: ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'AWAITING_PHYSICAL'] } } }),
      prisma.returnProcess.count({ where: { status: 'AWAITING_INSPECTION' } }),
      prisma.returnProcess.count({ where: { status: 'AWAITING_FINANCIAL' } }),
      prisma.returnProcess.count({ where: { status: 'COMPLETED' } }),
    ]);
    return { total, pending, awaitingInspection, awaitingFinancial, completed };
  }

  async transaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito no processamento da devolução. Tente novamente.', 409, 'RETURN_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito no processamento da devolução. Tente novamente.', 409, 'RETURN_CONCURRENCY_CONFLICT');
  }
}
