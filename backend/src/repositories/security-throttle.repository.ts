import { Prisma, type SecurityThrottle } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface SecurityThrottleKey {
  scope: string;
  subjectHash: string;
}

export interface SecurityThrottleState extends SecurityThrottleKey {
  attemptCount: number;
  blockLevel: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
}

export interface SecurityThrottleRepository {
  lock(keys: SecurityThrottleKey[], transaction?: Prisma.TransactionClient): Promise<void>;
  findMany(keys: SecurityThrottleKey[], transaction?: Prisma.TransactionClient): Promise<SecurityThrottle[]>;
  save(state: SecurityThrottleState, transaction?: Prisma.TransactionClient): Promise<void>;
  remove(key: SecurityThrottleKey, transaction?: Prisma.TransactionClient): Promise<void>;
}

export class PrismaSecurityThrottleRepository implements SecurityThrottleRepository {
  async lock(keys: SecurityThrottleKey[], transaction?: Prisma.TransactionClient): Promise<void> {
    if (!transaction) return;
    for (const key of [...keys].sort((left, right) => `${left.scope}:${left.subjectHash}`.localeCompare(`${right.scope}:${right.subjectHash}`))) {
      await transaction.$queryRaw(Prisma.sql`
        SELECT 1 AS "locked"
        FROM (
          SELECT pg_advisory_xact_lock(
            hashtextextended(${'security-throttle:' + key.scope + ':' + key.subjectHash}, 0)
          )
        ) AS "security_throttle_lock"
      `);
    }
  }

  findMany(keys: SecurityThrottleKey[], transaction?: Prisma.TransactionClient): Promise<SecurityThrottle[]> {
    if (keys.length === 0) return Promise.resolve([]);
    return (transaction ?? prisma).securityThrottle.findMany({
      where: { OR: keys.map((key) => ({ scope: key.scope, subjectHash: key.subjectHash })) },
    });
  }

  async save(state: SecurityThrottleState, transaction?: Prisma.TransactionClient): Promise<void> {
    await (transaction ?? prisma).securityThrottle.upsert({
      where: { scope_subjectHash: { scope: state.scope, subjectHash: state.subjectHash } },
      create: state,
      update: {
        attemptCount: state.attemptCount,
        blockLevel: state.blockLevel,
        windowStartedAt: state.windowStartedAt,
        blockedUntil: state.blockedUntil,
      },
      select: { id: true },
    });
  }

  async remove(key: SecurityThrottleKey, transaction?: Prisma.TransactionClient): Promise<void> {
    await (transaction ?? prisma).securityThrottle.deleteMany({
      where: { scope: key.scope, subjectHash: key.subjectHash },
    });
  }
}
