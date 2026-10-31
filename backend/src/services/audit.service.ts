import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { AuditLogInput } from '../types/audit.js';

export type AuditTransaction = Prisma.TransactionClient | undefined;

export interface AuditLogger {
  transaction<T>(operation: (transaction: AuditTransaction) => Promise<T>): Promise<T>;
  log(input: AuditLogInput, transaction?: AuditTransaction): Promise<void>;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized.includes('password')
    || normalized.includes('token')
    || normalized.includes('secret')
    || ['authorization', 'cookie', 'credentials', 'databaseurl'].includes(normalized);
}

type SanitizedJson = Prisma.InputJsonValue | null | undefined;

function sanitizeValue(value: unknown, seen: WeakSet<object>): SanitizedJson {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const sanitized: Prisma.InputJsonArray = value.flatMap((item) => {
      const result = sanitizeValue(item, seen);
      return result === undefined ? [] : [result];
    });
    seen.delete(value);
    return sanitized;
  }
  const output: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    const sanitized = sanitizeValue(item, seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  seen.delete(value);
  return output;
}

export function sanitizeAuditData(value: unknown): SanitizedJson {
  return sanitizeValue(value, new WeakSet());
}

export function pickAuditFields(source: object, fields: readonly string[]): Record<string, unknown> {
  const record = source as Record<string, unknown>;
  return Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]));
}

export function buildAuditDiff(
  before: object,
  after: object,
  fields: readonly string[],
): { oldData: Record<string, unknown>; newData: Record<string, unknown> } {
  const oldData: Record<string, unknown> = {};
  const newData: Record<string, unknown> = {};
  const oldRecord = before as Record<string, unknown>;
  const newRecord = after as Record<string, unknown>;
  for (const field of fields) {
    const previous = sanitizeAuditData(oldRecord[field]);
    const next = sanitizeAuditData(newRecord[field]);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      oldData[field] = oldRecord[field];
      newData[field] = newRecord[field];
    }
  }
  return { oldData, newData };
}

export class PrismaAuditService implements AuditLogger {
  transaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction((transaction) => operation(transaction));
  }

  async log(input: AuditLogInput, transaction: AuditTransaction = undefined): Promise<void> {
    const database = transaction ?? prisma;
    const oldData = sanitizeAuditData(input.oldData);
    const newData = sanitizeAuditData(input.newData);
    await database.auditLog.create({
      data: {
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        ...(oldData !== undefined ? { oldData: oldData === null ? Prisma.JsonNull : oldData } : {}),
        ...(newData !== undefined ? { newData: newData === null ? Prisma.JsonNull : newData } : {}),
      },
      select: { id: true },
    });
  }
}

export const noopAuditLogger: AuditLogger = {
  transaction: (operation) => operation(undefined),
  log: async () => undefined,
};

export const auditLogger = new PrismaAuditService();
