import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { AuditLogView, ListAuditLogsInput } from '../types/audit.js';

const auditSelect = {
  id: true,
  userId: true,
  user: { select: { id: true, name: true, email: true } },
  entityType: true,
  entityId: true,
  action: true,
  oldData: true,
  newData: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

export interface AuditRepository {
  list(input: ListAuditLogsInput): Promise<{ logs: AuditLogView[]; total: number }>;
}

export class PrismaAuditRepository implements AuditRepository {
  async list(input: ListAuditLogsInput): Promise<{ logs: AuditLogView[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...(input.search ? { OR: [
        { entityId: { contains: input.search, mode: 'insensitive' } },
        { user: { is: { OR: [
          { name: { contains: input.search, mode: 'insensitive' } },
          { email: { contains: input.search, mode: 'insensitive' } },
        ] } } },
      ] } : {}),
      ...(input.dateFrom || input.dateTo ? { createdAt: {
        ...(input.dateFrom ? { gte: input.dateFrom } : {}),
        ...(input.dateTo ? { lte: input.dateTo } : {}),
      } } : {}),
    };
    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: input.sortOrder },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: auditSelect,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { logs, total };
  }
}
