import { PayableStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { ListPayablesInput } from '../types/payable.js';

export const payableInclude = {
  supplier: { select: { id: true, name: true, document: true, email: true } },
  purchaseOrder: { select: { id: true, number: true } },
  purchaseReceipt: { select: { id: true, number: true, receivedAt: true } },
  payments: {
    orderBy: { paidAt: 'desc' as const },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      reversedBy: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.PayableInclude;

export function utcToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class PrismaPayableRepository {
  async list(input: ListPayablesInput, today: Date) {
    const openStatuses = [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID];
    const effectiveStatus: Prisma.PayableWhereInput = input.status === 'OVERDUE'
      ? { status: { in: openStatuses }, dueDate: { lt: today } }
      : input.status === 'PENDING' || input.status === 'PARTIALLY_PAID'
        ? { status: input.status, dueDate: { gte: today } }
        : input.status ? { status: input.status } : {};
    const where: Prisma.PayableWhereInput = {
      origin: 'PURCHASE',
      ...effectiveStatus,
      ...(input.search ? { OR: [
        { number: { contains: input.search, mode: 'insensitive' } },
        { supplier: { is: { name: { contains: input.search, mode: 'insensitive' } } } },
        { supplier: { is: { document: { contains: input.search, mode: 'insensitive' } } } },
        { purchaseOrder: { is: { number: { contains: input.search, mode: 'insensitive' } } } },
        { purchaseReceipt: { is: { number: { contains: input.search, mode: 'insensitive' } } } },
      ] } : {}),
      ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.dueFrom || input.dueTo ? { dueDate: {
        ...(effectiveStatus.dueDate && typeof effectiveStatus.dueDate === 'object' ? effectiveStatus.dueDate : {}),
        ...(input.dueFrom ? { gte: input.dueFrom } : {}),
        ...(input.dueTo ? { lte: input.dueTo } : {}),
      } } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.payable.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
        include: { supplier: { select: { id: true, name: true, document: true } }, purchaseOrder: { select: { id: true, number: true } }, purchaseReceipt: { select: { id: true, number: true } }, _count: { select: { payments: true } } } }),
      prisma.payable.count({ where }),
    ]);
    return { records: records.map(({ _count, ...record }) => ({ ...record, paymentsCount: _count.payments })), total };
  }
  findById(id: string) { return prisma.payable.findUnique({ where: { id }, include: payableInclude }); }
  async summary(days: number, today: Date) {
    const end = new Date(today.getTime() + days * 86_400_000);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const openWhere: Prisma.PayableWhereInput = { status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] } };
    const [open, overdue, dueSoon, paidThisMonth, flowRows] = await prisma.$transaction([
      prisma.payable.findMany({ where: openWhere, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true } }),
      prisma.payable.findMany({ where: { ...openWhere, dueDate: { lt: today } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true } }),
      prisma.payable.findMany({ where: { ...openWhere, dueDate: { gte: today, lt: end } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true } }),
      prisma.payablePayment.aggregate({ where: { reversedAt: null, paidAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true }, _count: true }),
      prisma.payable.findMany({ where: { ...openWhere, dueDate: { gte: today, lt: end } }, select: { dueDate: true, originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true }, orderBy: { dueDate: 'asc' } }),
    ]);
    const total = (rows: Array<{ originalAmount: Prisma.Decimal; interestAmount: Prisma.Decimal; penaltyAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }>) => rows.reduce((sum, row) => sum.add(row.originalAmount.add(row.interestAmount).add(row.penaltyAmount).sub(row.discountAmount).sub(row.paidAmount)), new Prisma.Decimal(0));
    return { openAmount: total(open), openCount: open.length, overdueAmount: total(overdue), overdueCount: overdue.length,
      dueSoonAmount: total(dueSoon), dueSoonCount: dueSoon.length, paidThisMonth: paidThisMonth._sum.amount ?? new Prisma.Decimal(0), paidThisMonthCount: paidThisMonth._count,
      flowRows, end };
  }
  async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito na operação financeira. Tente novamente.', 409, 'PAYABLE_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito na operação financeira. Tente novamente.', 409, 'PAYABLE_CONCURRENCY_CONFLICT');
  }
}
