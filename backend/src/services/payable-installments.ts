import { Prisma } from '@prisma/client';

export interface PayableInstallment {
  number: number;
  amount: Prisma.Decimal;
  dueDate: Date;
}

export function buildPayableInstallments(
  total: Prisma.Decimal,
  count: number,
  firstDueDays: number,
  intervalDays: number,
  baseDate: Date,
): PayableInstallment[] {
  const cents = BigInt(total.mul(100).toFixed(0));
  const divisor = BigInt(count);
  const baseCents = cents / divisor;
  const remainder = Number(cents % divisor);
  const baseUtc = Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate());
  return Array.from({ length: count }, (_, index) => {
    const amountCents = baseCents + (index < remainder ? 1n : 0n);
    const dueDays = firstDueDays + index * intervalDays;
    return {
      number: index + 1,
      amount: new Prisma.Decimal(amountCents.toString()).div(100),
      dueDate: new Date(baseUtc + dueDays * 86_400_000),
    };
  });
}
