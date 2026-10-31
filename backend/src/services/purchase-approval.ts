import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';

export interface ApprovalRuleSnapshot {
  active: boolean;
  maxAmount: Prisma.Decimal | null;
}

export function assertWithinApprovalLimit(total: Prisma.Decimal, rule: ApprovalRuleSnapshot | null): asserts rule is ApprovalRuleSnapshot {
  if (!rule || !rule.active) {
    throw new AppError('Seu perfil não possui uma alçada de aprovação ativa.', 403, 'APPROVAL_RULE_NOT_FOUND');
  }
  if (rule.maxAmount !== null && total.gt(rule.maxAmount)) {
    throw new AppError(`O valor da compra excede sua alçada de R$ ${rule.maxAmount.toFixed(2)}.`, 403, 'APPROVAL_LIMIT_EXCEEDED');
  }
}
