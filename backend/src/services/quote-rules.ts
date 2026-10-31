import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';

export interface QuoteLineCalculation {
  originalUnitPrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  grossTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

export function calculateQuoteLine(
  originalUnitPrice: Prisma.Decimal.Value,
  quantity: number,
  discountPercent: Prisma.Decimal.Value,
): QuoteLineCalculation {
  const price = new Prisma.Decimal(originalUnitPrice).toDecimalPlaces(2);
  const discount = new Prisma.Decimal(discountPercent);
  const grossTotal = price.mul(quantity).toDecimalPlaces(2);
  const unitPrice = price.mul(new Prisma.Decimal(100).minus(discount)).div(100).toDecimalPlaces(2);
  const subtotal = unitPrice.mul(quantity).toDecimalPlaces(2);
  return {
    originalUnitPrice: price,
    discountPercent: discount,
    unitPrice,
    grossTotal,
    discountTotal: grossTotal.minus(subtotal).toDecimalPlaces(2),
    subtotal,
  };
}

export function effectiveDiscountPercent(grossTotal: Prisma.Decimal.Value, discountTotal: Prisma.Decimal.Value): Prisma.Decimal {
  const gross = new Prisma.Decimal(grossTotal);
  if (gross.isZero()) return new Prisma.Decimal(0);
  return new Prisma.Decimal(discountTotal).mul(100).div(gross).toDecimalPlaces(4);
}

export function calculateCommission(total: Prisma.Decimal.Value, rate: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(total).mul(rate).div(100).toDecimalPlaces(2);
}

export function assertWithinDiscountApprovalLimit(
  discountPercent: Prisma.Decimal.Value,
  rule: { active: boolean; maxDiscountPercent: Prisma.Decimal } | null,
): void {
  if (!rule?.active) {
    throw new AppError('Seu perfil não possui uma alçada de desconto ativa.', 403, 'QUOTE_APPROVAL_RULE_NOT_FOUND');
  }
  const discount = new Prisma.Decimal(discountPercent);
  if (discount.gt(rule.maxDiscountPercent)) {
    throw new AppError(
      `O desconto de ${discount.toFixed(2)}% excede sua alçada de ${rule.maxDiscountPercent.toFixed(2)}%.`,
      403,
      'QUOTE_DISCOUNT_LIMIT_EXCEEDED',
    );
  }
}

export function quoteReservationExpiry(validUntil: Date, reservationHours: number, now = new Date()): Date {
  const requested = new Date(now.getTime() + reservationHours * 60 * 60 * 1000);
  const validityEnd = new Date(validUntil);
  validityEnd.setUTCHours(23, 59, 59, 999);
  return requested < validityEnd ? requested : validityEnd;
}

export function isQuoteExpired(validUntil: Date, now = new Date()): boolean {
  const validityEnd = new Date(validUntil);
  validityEnd.setUTCHours(23, 59, 59, 999);
  return now > validityEnd;
}
