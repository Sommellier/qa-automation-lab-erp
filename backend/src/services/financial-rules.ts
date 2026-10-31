import {
  FinancialAdjustmentKind,
  FinancialCalculationType,
  FinancialRecurrenceFrequency,
  Prisma,
} from '@prisma/client';

const HUNDRED = new Prisma.Decimal(100);

export function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function adjustedTitleAmount(title: {
  originalAmount: Prisma.Decimal;
  interestAmount: Prisma.Decimal;
  penaltyAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
}): Prisma.Decimal {
  return money(title.originalAmount.add(title.interestAmount).add(title.penaltyAmount).sub(title.discountAmount));
}

export function outstandingTitleAmount(title: {
  originalAmount: Prisma.Decimal;
  interestAmount: Prisma.Decimal;
  penaltyAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  settledAmount: Prisma.Decimal;
}): Prisma.Decimal {
  return money(adjustedTitleAmount(title).sub(title.settledAmount));
}

export interface AllocationInput {
  costCenterId: string;
  percentage: Prisma.Decimal.Value;
}

export function allocateByPercentage(total: Prisma.Decimal.Value, allocations: AllocationInput[]) {
  if (!allocations.length) throw new Error('ALLOCATION_REQUIRED');
  const totalMoney = money(total);
  const percentageTotal = allocations.reduce((sum, item) => sum.add(item.percentage), new Prisma.Decimal(0));
  if (!percentageTotal.eq(100)) throw new Error('ALLOCATION_PERCENTAGE_TOTAL');
  const totalCents = BigInt(totalMoney.mul(100).toFixed(0));
  let distributed = 0n;
  return allocations.map((item, index) => {
    const percentage = new Prisma.Decimal(item.percentage);
    if (percentage.lte(0) || percentage.gt(100)) throw new Error('ALLOCATION_PERCENTAGE_INVALID');
    const isLast = index === allocations.length - 1;
    const cents = isLast
      ? totalCents - distributed
      : BigInt(totalMoney.mul(percentage).div(100).mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN).toFixed(0));
    distributed += cents;
    return {
      costCenterId: item.costCenterId,
      percentage: percentage.toDecimalPlaces(4),
      amount: new Prisma.Decimal(cents.toString()).div(100),
    };
  });
}

export interface AdjustmentCalculationInput {
  kind: FinancialAdjustmentKind;
  calculationType: FinancialCalculationType;
  baseAmount: Prisma.Decimal.Value;
  fixedAmount?: Prisma.Decimal.Value;
  rate?: Prisma.Decimal.Value;
  periodStart?: Date;
  periodEnd?: Date;
}

export function calculateFinancialAdjustment(input: AdjustmentCalculationInput) {
  const baseAmount = money(input.baseAmount);
  if (baseAmount.lte(0)) throw new Error('ADJUSTMENT_BASE_INVALID');
  let days = 0;
  if (input.periodStart && input.periodEnd) {
    days = Math.max(0, Math.floor((Date.UTC(input.periodEnd.getUTCFullYear(), input.periodEnd.getUTCMonth(), input.periodEnd.getUTCDate())
      - Date.UTC(input.periodStart.getUTCFullYear(), input.periodStart.getUTCMonth(), input.periodStart.getUTCDate())) / 86_400_000));
  }
  let calculated: Prisma.Decimal;
  if (input.calculationType === FinancialCalculationType.FIXED) {
    if (input.fixedAmount === undefined) throw new Error('ADJUSTMENT_FIXED_AMOUNT_REQUIRED');
    calculated = money(input.fixedAmount);
  } else {
    if (input.rate === undefined) throw new Error('ADJUSTMENT_RATE_REQUIRED');
    const rate = new Prisma.Decimal(input.rate);
    if (rate.lte(0)) throw new Error('ADJUSTMENT_RATE_INVALID');
    const proportionalFactor = input.kind === FinancialAdjustmentKind.INTEREST && input.periodStart && input.periodEnd
      ? new Prisma.Decimal(days).div(30)
      : new Prisma.Decimal(1);
    calculated = money(baseAmount.mul(rate).div(HUNDRED).mul(proportionalFactor));
  }
  if (calculated.lte(0)) throw new Error('ADJUSTMENT_AMOUNT_INVALID');
  return {
    baseAmount,
    days,
    calculatedAmount: calculated,
    memory: {
      formula: input.calculationType === FinancialCalculationType.FIXED
        ? 'valor fixo'
        : input.kind === FinancialAdjustmentKind.INTEREST && input.periodStart && input.periodEnd
          ? 'principal × taxa ÷ 100 × dias ÷ 30'
          : 'principal × taxa ÷ 100',
      rounding: '2 casas, HALF_UP',
      baseAmount: baseAmount.toFixed(2),
      rate: input.rate === undefined ? null : new Prisma.Decimal(input.rate).toFixed(6),
      days,
      periodStart: input.periodStart?.toISOString().slice(0, 10) ?? null,
      periodEnd: input.periodEnd?.toISOString().slice(0, 10) ?? null,
      calculatedAmount: calculated.toFixed(2),
    },
  };
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function withDueDay(year: number, month: number, preferredDay: number): Date {
  return new Date(Date.UTC(year, month, Math.min(preferredDay, daysInUtcMonth(year, month))));
}

export function nextRecurrenceDate(current: Date, frequency: FinancialRecurrenceFrequency, dueDay?: number | null): Date {
  const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
  const day = dueDay ?? date.getUTCDate();
  const addDays = (value: number) => new Date(date.getTime() + value * 86_400_000);
  switch (frequency) {
    case FinancialRecurrenceFrequency.DAILY: return addDays(1);
    case FinancialRecurrenceFrequency.WEEKLY: return addDays(7);
    case FinancialRecurrenceFrequency.FORTNIGHTLY: return addDays(15);
    case FinancialRecurrenceFrequency.MONTHLY: return withDueDay(date.getUTCFullYear(), date.getUTCMonth() + 1, day);
    case FinancialRecurrenceFrequency.BIMONTHLY: return withDueDay(date.getUTCFullYear(), date.getUTCMonth() + 2, day);
    case FinancialRecurrenceFrequency.QUARTERLY: return withDueDay(date.getUTCFullYear(), date.getUTCMonth() + 3, day);
    case FinancialRecurrenceFrequency.SEMIANNUAL: return withDueDay(date.getUTCFullYear(), date.getUTCMonth() + 6, day);
    case FinancialRecurrenceFrequency.ANNUAL: return withDueDay(date.getUTCFullYear() + 1, date.getUTCMonth(), day);
  }
}

export function centsEqual(left: Prisma.Decimal.Value, right: Prisma.Decimal.Value): boolean {
  return money(left).eq(money(right));
}

export function dateDistanceDays(left: Date, right: Date): number {
  const leftUtc = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const rightUtc = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());
  return Math.abs(Math.round((leftUtc - rightUtc) / 86_400_000));
}

export function reconciliationConfidence(input: {
  transactionAmount: Prisma.Decimal.Value;
  movementAmount: Prisma.Decimal.Value;
  transactionDate: Date;
  movementDate: Date;
  transactionReference?: string | null;
  movementReference?: string | null;
  description?: string;
}) {
  if (!centsEqual(input.transactionAmount, input.movementAmount)) return { score: 0, deterministic: false, reasons: ['valor divergente'] };
  let score = 60;
  const reasons = ['valor idêntico'];
  const distance = dateDistanceDays(input.transactionDate, input.movementDate);
  if (distance === 0) { score += 20; reasons.push('mesma data'); }
  else if (distance <= 3) { score += 10; reasons.push(`data próxima (${distance} dia(s))`); }
  const transactionReference = input.transactionReference?.trim().toLowerCase();
  const movementReference = input.movementReference?.trim().toLowerCase();
  const referenceMatch = Boolean(transactionReference && movementReference && transactionReference === movementReference);
  if (referenceMatch) { score += 20; reasons.push('referência idêntica'); }
  return { score: Math.min(score, 100), deterministic: referenceMatch && distance <= 3, reasons };
}
