import { Prisma, ReturnFinancialAdjustmentType, ReturnStatus } from '@prisma/client';

export function eligibleReturnQuantity(originalQuantity: number, alreadyCommitted: number): number {
  if (!Number.isInteger(originalQuantity) || originalQuantity < 0 || !Number.isInteger(alreadyCommitted) || alreadyCommitted < 0) throw new Error('INVALID_RETURN_QUANTITY');
  return Math.max(0, originalQuantity - alreadyCommitted);
}

export function exchangeDifference(returnedTotal: Prisma.Decimal.Value, replacementTotal: Prisma.Decimal.Value) {
  const difference = new Prisma.Decimal(replacementTotal).minus(returnedTotal).toDecimalPlaces(2);
  if (difference.isZero()) return null;
  return {
    type: difference.isPositive() ? ReturnFinancialAdjustmentType.EXCHANGE_CHARGE : ReturnFinancialAdjustmentType.EXCHANGE_REFUND,
    amount: difference.abs(),
  };
}

export function resolvedOperationalStatus(inspectionPending: boolean, financialPending: boolean): ReturnStatus {
  if (inspectionPending) return ReturnStatus.AWAITING_INSPECTION;
  if (financialPending) return ReturnStatus.AWAITING_FINANCIAL;
  return ReturnStatus.COMPLETED;
}
