import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({ transaction: vi.fn(), create: vi.fn() }));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    $transaction: prismaMock.transaction,
    auditLog: { create: prismaMock.create },
  },
}));

import { PrismaAuditService, buildAuditDiff, sanitizeAuditData } from './audit.service.js';

describe('AuditService', () => {
  beforeEach(() => {
    prismaMock.transaction.mockReset();
    prismaMock.create.mockReset();
    prismaMock.create.mockResolvedValue({ id: randomUUID() });
  });

  it('remove campos sensíveis recursivamente e normaliza tipos JSON', () => {
    const sanitized = sanitizeAuditData({
      name: 'Usuário',
      password: 'não-persistir',
      passwordHash: 'não-persistir',
      nested: {
        accessToken: 'não-persistir',
        refresh_token: 'não-persistir',
        JWT_SECRET: 'não-persistir',
        credentials: 'não-persistir',
        price: new Prisma.Decimal('349.90'),
        when: new Date('2026-09-27T12:00:00.000Z'),
      },
    });

    expect(sanitized).toEqual({
      name: 'Usuário',
      nested: { price: '349.90', when: '2026-09-27T12:00:00.000Z' },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/password|token|secret|credentials/i);
  });

  it('remove todos os nomes sensíveis usados na alteração de senha', () => {
    const sanitized = sanitizeAuditData({
      currentPassword: 'Atual@123',
      newPassword: 'Nova@123',
      confirmPassword: 'Nova@123',
      passwordHash: 'hash',
      token: 'jwt',
      changed: true,
    });
    expect(sanitized).toEqual({ changed: true });
  });

  it('persiste somente o conteúdo sanitizado no cliente transacional recebido', async () => {
    const transaction = { auditLog: { create: vi.fn().mockResolvedValue({ id: randomUUID() }) } };
    const service = new PrismaAuditService();
    await service.log({
      userId: randomUUID(),
      entityType: AuditEntity.USER,
      entityId: randomUUID(),
      action: AuditAction.CREATE,
      newData: { email: 'novo@empresa.com', password: 'Senha@123', passwordHash: 'hash' },
    }, transaction as never);

    expect(transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ newData: { email: 'novo@empresa.com' } }),
      select: { id: true },
    }));
    expect(prismaMock.create).not.toHaveBeenCalled();
  });

  it('propaga falhas da transação sem tentar registrar fora dela', async () => {
    prismaMock.transaction.mockImplementation(async (operation: (transaction: unknown) => Promise<unknown>) => {
      await operation({ auditLog: { create: vi.fn().mockRejectedValue(new Error('falha de auditoria')) } });
    });
    const service = new PrismaAuditService();
    await expect(service.transaction(async (transaction) => {
      await service.log({ userId: randomUUID(), entityType: AuditEntity.CLIENT, entityId: randomUUID(), action: AuditAction.CREATE }, transaction);
    })).rejects.toThrow('falha de auditoria');
    expect(prismaMock.create).not.toHaveBeenCalled();
  });

  it('gera diferenças somente para campos alterados', () => {
    expect(buildAuditDiff({ name: 'Mouse', stock: 10 }, { name: 'Mouse', stock: 8 }, ['name', 'stock']))
      .toEqual({ oldData: { stock: 10 }, newData: { stock: 8 } });
  });
});
