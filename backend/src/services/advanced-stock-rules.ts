import { Prisma } from '@prisma/client';

export const stockMoney = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const stockCost = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

export function availableQuantity(balance: { physical: number; reserved: number; blocked: number }): number {
  return balance.physical - balance.reserved - balance.blocked;
}

export function consolidatedBalance(balances: Array<{ physical: number; reserved: number; blocked: number; inTransit: number }>) {
  return balances.reduce<{ physical: number; reserved: number; blocked: number; available: number; inTransit: number }>((total, item) => ({
    physical: total.physical + item.physical,
    reserved: total.reserved + item.reserved,
    blocked: total.blocked + item.blocked,
    available: total.available + availableQuantity(item),
    inTransit: total.inTransit + item.inTransit,
  }), { physical: 0, reserved: 0, blocked: 0, available: 0, inTransit: 0 });
}

export function movingAverageCost(input: {
  previousQuantity: number;
  previousAverageCost: Prisma.Decimal.Value;
  inboundQuantity: number;
  inboundUnitCost: Prisma.Decimal.Value;
}) {
  if (input.previousQuantity < 0 || input.inboundQuantity <= 0) throw new Error('INVALID_COST_QUANTITY');
  const previousCost = stockCost(input.previousAverageCost);
  const inboundCost = stockCost(input.inboundUnitCost);
  if (previousCost.lt(0) || inboundCost.lt(0)) throw new Error('INVALID_STOCK_COST');
  const previousValue = stockMoney(previousCost.mul(input.previousQuantity));
  const inboundValue = stockMoney(inboundCost.mul(input.inboundQuantity));
  const newQuantity = input.previousQuantity + input.inboundQuantity;
  const newValue = stockMoney(previousValue.add(inboundValue));
  return {
    previousValue,
    inboundValue,
    newQuantity,
    newValue,
    averageCost: stockCost(newValue.div(newQuantity)),
  };
}

export function outboundCost(quantity: number, historicalUnitCost: Prisma.Decimal.Value) {
  if (quantity <= 0) throw new Error('INVALID_COST_QUANTITY');
  const unitCost = stockCost(historicalUnitCost);
  if (unitCost.lt(0)) throw new Error('INVALID_STOCK_COST');
  return { unitCost, amount: stockMoney(unitCost.mul(quantity)) };
}

export function inventoryDivergence(expected: number, counted: number) {
  if (expected < 0 || counted < 0) throw new Error('INVALID_INVENTORY_QUANTITY');
  const quantity = counted - expected;
  return { quantity, classification: quantity > 0 ? 'SURPLUS' as const : quantity < 0 ? 'SHORTAGE' as const : 'MATCH' as const };
}

export function proportionalCogsReversal(input: {
  originalQuantity: number;
  originalAmount: Prisma.Decimal.Value;
  alreadyReversedQuantity: number;
  returnedQuantity: number;
}) {
  if (input.originalQuantity <= 0 || input.returnedQuantity <= 0 || input.alreadyReversedQuantity < 0
    || input.alreadyReversedQuantity + input.returnedQuantity > input.originalQuantity) throw new Error('COGS_REVERSAL_EXCEEDS_ELIGIBLE');
  const unitCost = stockCost(new Prisma.Decimal(input.originalAmount).div(input.originalQuantity));
  return { unitCost, amount: stockMoney(unitCost.mul(input.returnedQuantity)) };
}

export function isExpired(expirationDate: Date | null | undefined, at = new Date()): boolean {
  if (!expirationDate) return false;
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  return expirationDate.getTime() < day;
}

export function expiresWithin(expirationDate: Date | null | undefined, days: number, at = new Date()): boolean {
  if (!expirationDate || days < 0 || isExpired(expirationDate, at)) return false;
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  return expirationDate.getTime() <= day + days * 86_400_000;
}

export function sortFefo<T extends { expirationDate: Date | null; createdAt: Date }>(lots: T[]): T[] {
  return [...lots].sort((left, right) => {
    if (left.expirationDate && right.expirationDate) return left.expirationDate.getTime() - right.expirationDate.getTime() || left.createdAt.getTime() - right.createdAt.getTime();
    if (left.expirationDate) return -1;
    if (right.expirationDate) return 1;
    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}
