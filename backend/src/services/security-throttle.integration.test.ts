import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { PrismaSecurityThrottleRepository } from '../repositories/security-throttle.repository.js';
import { auditLogger } from './audit.service.js';
import { SecurityThrottleService } from './security-throttle.service.js';

describe.skipIf(process.env.RUN_DB_INTEGRATION !== '1')('limite de abuso com PostgreSQL real', () => {
  const unique = randomUUID();
  const ip = `integration-ip-${unique}`;
  const account = `integration-account-${unique}@teste.local`;
  const hash = (dimension: 'IP' | 'ACCOUNT', subject: string) => createHmac('sha256', env.JWT_SECRET)
    .update(`rate-limit:${dimension}:${subject.toLowerCase()}`)
    .digest('hex');
  const ipHash = hash('IP', ip);
  const accountHash = hash('ACCOUNT', account);
  let now = new Date();
  const service = new SecurityThrottleService(
    new PrismaSecurityThrottleRepository(),
    auditLogger,
    () => now,
  );

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: 'SECURITY', entityId: accountHash } });
    await prisma.securityThrottle.deleteMany({ where: { subjectHash: { in: [ipHash, accountHash] } } });
  });

  it('serializa tentativas simultâneas, persiste HMACs e progride sem bloqueio permanente', async () => {
    const firstBurst = await Promise.allSettled(Array.from({ length: 5 }, () => (
      service.recordFailure('LOGIN', { ip, account }, 'INVALID_CREDENTIALS')
    )));
    expect(firstBurst.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(firstBurst.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 60 }),
    });

    const firstStates = await prisma.securityThrottle.findMany({
      where: { subjectHash: { in: [ipHash, accountHash] } },
      orderBy: { scope: 'asc' },
    });
    expect(firstStates).toHaveLength(2);
    expect(firstStates.every((state) => state.blockLevel === 1 && state.blockedUntil !== null)).toBe(true);
    expect(JSON.stringify(firstStates)).not.toMatch(new RegExp(`${unique}|teste\\.local`));

    now = new Date(now.getTime() + 60_001);
    await expect(service.assertAllowed('LOGIN', { ip, account })).resolves.toBeUndefined();
    const secondBurst = await Promise.allSettled(Array.from({ length: 5 }, () => (
      service.recordFailure('LOGIN', { ip, account }, 'INVALID_CREDENTIALS')
    )));
    expect(secondBurst.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(secondBurst.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 120 }),
    });

    await service.clearAccount('LOGIN', account);
    expect(await prisma.securityThrottle.count({ where: { scope: 'LOGIN_ACCOUNT', subjectHash: accountHash } })).toBe(0);
    expect(await prisma.securityThrottle.count({ where: { scope: 'LOGIN_IP', subjectHash: ipHash } })).toBe(1);

    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: 'SECURITY', entityId: accountHash },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditEntries.filter((entry) => entry.action === 'LOGIN_FAILURE')).toHaveLength(10);
    expect(auditEntries.filter((entry) => entry.action === 'RATE_LIMIT_BLOCK')).toHaveLength(2);
    expect(JSON.stringify(auditEntries)).not.toMatch(new RegExp(`${unique}|teste\\.local`));
  }, 20_000);
});
