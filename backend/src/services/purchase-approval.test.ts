import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { assertWithinApprovalLimit } from './purchase-approval.js';

describe('alçada de aprovação de compras', () => {
  it('aceita valor igual ou inferior ao limite ativo', () => {
    expect(() => assertWithinApprovalLimit(new Prisma.Decimal('10000.00'), { active: true, maxAmount: new Prisma.Decimal('10000.00') })).not.toThrow();
    expect(() => assertWithinApprovalLimit(new Prisma.Decimal('9999.99'), { active: true, maxAmount: new Prisma.Decimal('10000.00') })).not.toThrow();
  });

  it('aceita qualquer valor quando a alçada é ilimitada', () => {
    expect(() => assertWithinApprovalLimit(new Prisma.Decimal('999999999.99'), { active: true, maxAmount: null })).not.toThrow();
  });

  it('rejeita valor acima do limite com erro de domínio', () => {
    try {
      assertWithinApprovalLimit(new Prisma.Decimal('10000.01'), { active: true, maxAmount: new Prisma.Decimal('10000.00') });
      expect.fail('A aprovação deveria ter sido rejeitada.');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 403, code: 'APPROVAL_LIMIT_EXCEEDED' });
    }
  });

  it('rejeita regra ausente ou inativa', () => {
    for (const rule of [null, { active: false, maxAmount: null }]) {
      expect(() => assertWithinApprovalLimit(new Prisma.Decimal('1.00'), rule)).toThrow(expect.objectContaining({ code: 'APPROVAL_RULE_NOT_FOUND' }));
    }
  });
});
