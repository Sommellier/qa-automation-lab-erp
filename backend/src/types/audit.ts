import type { AuditAction, AuditEntity, Prisma } from '@prisma/client';

export interface AuditLogInput {
  userId: string | null;
  entityType: AuditEntity;
  entityId: string;
  action: AuditAction;
  oldData?: unknown;
  newData?: unknown;
}

export interface AuditActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogView {
  id: string;
  userId: string | null;
  user: AuditActor | null;
  entityType: AuditEntity;
  entityId: string;
  action: AuditAction;
  oldData: Prisma.JsonValue | null;
  newData: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface ListAuditLogsInput {
  entityType?: AuditEntity | undefined;
  action?: AuditAction | undefined;
  userId?: string | undefined;
  entityId?: string | undefined;
  search?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  page: number;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
}
