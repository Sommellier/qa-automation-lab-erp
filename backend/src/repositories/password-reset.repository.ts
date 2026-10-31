import { Prisma, type PasswordResetToken } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export type PasswordResetTokenWithUser = Prisma.PasswordResetTokenGetPayload<{
  include: { user: true };
}>;

export interface PasswordResetRepository {
  lockUser(userId: string, transaction?: Prisma.TransactionClient): Promise<void>;
  create(
    data: Pick<PasswordResetToken, 'userId' | 'tokenHash' | 'expiresAt'>,
    transaction?: Prisma.TransactionClient,
  ): Promise<void>;
  findValidByHash(
    tokenHash: string,
    now: Date,
    transaction?: Prisma.TransactionClient,
  ): Promise<PasswordResetTokenWithUser | null>;
  consume(id: string, usedAt: Date, transaction?: Prisma.TransactionClient): Promise<boolean>;
  invalidateUnusedForUser(userId: string, usedAt: Date, transaction?: Prisma.TransactionClient): Promise<void>;
}

export class PrismaPasswordResetRepository implements PasswordResetRepository {
  async lockUser(userId: string, transaction?: Prisma.TransactionClient): Promise<void> {
    if (!transaction) return;
    await transaction.$queryRaw(Prisma.sql`
      SELECT 1 AS "locked"
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${'password-reset:' + userId}, 0))) AS "password_reset_lock"
    `);
  }

  async create(
    data: Pick<PasswordResetToken, 'userId' | 'tokenHash' | 'expiresAt'>,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    await (transaction ?? prisma).passwordResetToken.create({ data, select: { id: true } });
  }

  findValidByHash(
    tokenHash: string,
    now: Date,
    transaction?: Prisma.TransactionClient,
  ): Promise<PasswordResetTokenWithUser | null> {
    return (transaction ?? prisma).passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: now },
        user: { active: true },
      },
      include: { user: true },
    });
  }

  async consume(id: string, usedAt: Date, transaction?: Prisma.TransactionClient): Promise<boolean> {
    const result = await (transaction ?? prisma).passwordResetToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: usedAt } },
      data: { usedAt },
    });
    return result.count === 1;
  }

  async invalidateUnusedForUser(
    userId: string,
    usedAt: Date,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    await (transaction ?? prisma).passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt },
    });
  }
}
