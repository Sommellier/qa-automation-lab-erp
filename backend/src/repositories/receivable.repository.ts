import { PayableStatus, Prisma, ReceivableStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { ListReceivablesInput } from '../types/receivable.js';

export const receivableInclude = {
  client: { select: { id: true, name: true, document: true, email: true } },
  order: { select: { id: true, number: true, status: true, total: true } },
  collections: { orderBy: { receivedAt: 'desc' as const }, include: {
    createdBy: { select: { id: true, name: true, email: true } },
    reversedBy: { select: { id: true, name: true, email: true } },
  } },
} satisfies Prisma.ReceivableInclude;

export class PrismaReceivableRepository {
  async list(input: ListReceivablesInput, today: Date) {
    const openStatuses = [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED];
    const effectiveStatus: Prisma.ReceivableWhereInput = input.status === 'OVERDUE'
      ? { status: { in: openStatuses }, dueDate: { lt: today } }
      : input.status === 'PENDING' || input.status === 'PARTIALLY_RECEIVED'
        ? { status: input.status, dueDate: { gte: today } }
        : input.status ? { status: input.status } : {};
    const where: Prisma.ReceivableWhereInput = {
      origin: 'SALE',
      ...effectiveStatus,
      ...(input.search ? { OR: [
        { number: { contains: input.search, mode: 'insensitive' } },
        { client: { is: { name: { contains: input.search, mode: 'insensitive' } } } },
        { client: { is: { document: { contains: input.search, mode: 'insensitive' } } } },
        { order: { is: { number: { contains: input.search, mode: 'insensitive' } } } },
      ] } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.dueFrom || input.dueTo ? { dueDate: {
        ...(effectiveStatus.dueDate && typeof effectiveStatus.dueDate === 'object' ? effectiveStatus.dueDate : {}),
        ...(input.dueFrom ? { gte: input.dueFrom } : {}), ...(input.dueTo ? { lte: input.dueTo } : {}),
      } } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.receivable.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
        include: { client: { select: { id: true, name: true, document: true } }, order: { select: { id: true, number: true } }, _count: { select: { collections: true } } } }),
      prisma.receivable.count({ where }),
    ]);
    return { records: records.map(({ _count, ...record }) => ({ ...record, collectionsCount: _count.collections })), total };
  }
  findById(id: string) { return prisma.receivable.findUnique({ where: { id }, include: receivableInclude }); }
  async summary(days: number, today: Date) {
    const end = new Date(today.getTime() + days * 86_400_000);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const openReceivables: Prisma.ReceivableWhereInput = { status: { in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED] } };
    const openPayables: Prisma.PayableWhereInput = { status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] } };
    const [all, open, overdue, collectedMonth, incomingFlow, outgoingFlow] = await prisma.$transaction([
      prisma.receivable.findMany({ where: { status: { not: ReceivableStatus.CANCELLED } }, select: { originalAmount: true, receivedAmount: true } }),
      prisma.receivable.findMany({ where: openReceivables, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, receivedAmount: true } }),
      prisma.receivable.findMany({ where: { ...openReceivables, dueDate: { lt: today } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, receivedAmount: true } }),
      prisma.receivableCollection.aggregate({ where: { reversedAt: null, receivedAt: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true }, _count: true }),
      prisma.receivable.findMany({ where: { ...openReceivables, dueDate: { gte: today, lt: end } }, select: { dueDate: true, originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, receivedAmount: true }, orderBy: { dueDate: 'asc' } }),
      prisma.payable.findMany({ where: { ...openPayables, dueDate: { gte: today, lt: end } }, select: { dueDate: true, originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true }, orderBy: { dueDate: 'asc' } }),
    ]);
    const billedAmount = all.reduce((sum, row) => sum.add(row.originalAmount), new Prisma.Decimal(0));
    const receivedAmount = all.reduce((sum, row) => sum.add(row.receivedAmount), new Prisma.Decimal(0));
    const outstanding = (rows: Array<{ originalAmount: Prisma.Decimal; interestAmount: Prisma.Decimal; penaltyAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; receivedAmount: Prisma.Decimal }>) => rows.reduce((sum, row) => sum.add(row.originalAmount.add(row.interestAmount).add(row.penaltyAmount).sub(row.discountAmount).sub(row.receivedAmount)), new Prisma.Decimal(0));
    return { billedAmount, receivedAmount, openAmount: outstanding(open), openCount: open.length, overdueAmount: outstanding(overdue), overdueCount: overdue.length,
      collectedThisMonth: collectedMonth._sum.amount ?? new Prisma.Decimal(0), collectedThisMonthCount: collectedMonth._count, incomingFlow, outgoingFlow, end };
  }
  async statement(clientId: string, page: number, pageSize: number) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, document: true, email: true, active: true } });
    if (!client) return null;
    const where: Prisma.ReceivableWhereInput = { clientId };
    const [records, total, totals] = await prisma.$transaction([
      prisma.receivable.findMany({ where, orderBy: [{ dueDate: 'desc' }, { number: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: { order: { select: { id: true, number: true } }, _count: { select: { collections: true } } } }),
      prisma.receivable.count({ where }),
      prisma.receivable.findMany({ where: { clientId, status: { not: ReceivableStatus.CANCELLED } }, select: { originalAmount: true, receivedAmount: true, status: true, dueDate: true } }),
    ]);
    return { client, records: records.map(({ _count, ...record }) => ({ ...record, collectionsCount: _count.collections })), total, totals };
  }
  async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito na operação financeira. Tente novamente.', 409, 'RECEIVABLE_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito na operação financeira. Tente novamente.', 409, 'RECEIVABLE_CONCURRENCY_CONFLICT');
  }
}
