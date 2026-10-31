import { AuditAction, AuditEntity, FinancialTitleType, PayableStatus, Prisma, UserRole } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { payableInclude, PrismaPayableRepository, utcToday } from '../repositories/payable.repository.js';
import type { ListPayablesQuery, PayableSummaryQuery, RegisterPaymentInput, ReversePaymentInput } from '../schemas/payable.schema.js';
import { effectivePayableStatus } from '../types/payable.js';
import type { AuditLogger } from './audit.service.js';
import { FinancialSettlementService } from './financial-settlement.service.js';

function viewWithEffectiveStatus<T extends { status: PayableStatus; dueDate: Date }>(record: T, today: Date) {
  return { ...record, status: effectivePayableStatus(record.status, record.dueDate, today) };
}

export class PayableService {
  constructor(private readonly payables: PrismaPayableRepository, private readonly audit: AuditLogger) {}

  async list(query: ListPayablesQuery) {
    const today = utcToday();
    const { records, total } = await this.payables.list(query, today);
    return { data: records.map((record) => viewWithEffectiveStatus(record, today)), pagination: {
      page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
    } };
  }

  async getById(id: string) {
    const payable = await this.payables.findById(id);
    if (!payable) throw new AppError('Conta a pagar não encontrada.', 404, 'PAYABLE_NOT_FOUND');
    return viewWithEffectiveStatus(payable, utcToday());
  }

  registerPayment(id: string, input: RegisterPaymentInput, actor: string) {
    return new FinancialSettlementService(this.audit).settlePayable(id, { amount: input.amount, method: input.method, bankAccountId: input.bankAccountId,
      ...(input.paidAt ? { settledAt: input.paidAt } : {}), ...(input.notes ? { notes: input.notes } : {}), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) }, actor);
  }

  reversePayment(id: string, paymentId: string, input: ReversePaymentInput, role: UserRole, actor: string) {
    return new FinancialSettlementService(this.audit).reverse(FinancialTitleType.PAYABLE, id, paymentId, input.reason, role, actor);
  }

  cancel(id: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem cancelar contas a pagar.', 403, 'PAYABLE_CANCEL_FORBIDDEN');
    return this.payables.transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "payables" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new AppError('Conta a pagar não encontrada.', 404, 'PAYABLE_NOT_FOUND');
      const payable = await tx.payable.findUnique({ where: { id } });
      if (!payable) throw new AppError('Conta a pagar não encontrada.', 404, 'PAYABLE_NOT_FOUND');
      if (payable.status === PayableStatus.CANCELLED) {
        const current = await tx.payable.findUniqueOrThrow({ where: { id }, include: payableInclude });
        return viewWithEffectiveStatus(current, utcToday());
      }
      if (!payable.paidAmount.eq(0)) throw new AppError('Estorne os pagamentos antes de cancelar a conta.', 409, 'PAYABLE_HAS_PAYMENTS');
      await tx.payable.update({ where: { id }, data: { status: PayableStatus.CANCELLED } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PAYABLE, entityId: id, action: AuditAction.CANCEL,
        oldData: { status: payable.status }, newData: { status: PayableStatus.CANCELLED } }, tx);
      const updated = await tx.payable.findUniqueOrThrow({ where: { id }, include: payableInclude });
      return viewWithEffectiveStatus(updated, utcToday());
    });
  }

  async summary(query: PayableSummaryQuery) {
    const today = utcToday();
    const result = await this.payables.summary(query.days, today);
    const byDate = new Map<string, Prisma.Decimal>();
    for (const row of result.flowRows) {
      const key = row.dueDate.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) ?? new Prisma.Decimal(0)).add(row.originalAmount.add(row.interestAmount).add(row.penaltyAmount).sub(row.discountAmount).sub(row.paidAmount)));
    }
    const cashFlow = Array.from({ length: query.days }, (_, index) => {
      const date = new Date(today.getTime() + index * 86_400_000).toISOString().slice(0, 10);
      return { date, amount: (byDate.get(date) ?? new Prisma.Decimal(0)).toFixed(2) };
    });
    return { generatedAt: new Date().toISOString(), period: { from: today.toISOString().slice(0, 10), to: new Date(result.end.getTime() - 1).toISOString().slice(0, 10), days: query.days },
      metrics: { openAmount: result.openAmount.toFixed(2), openCount: result.openCount, overdueAmount: result.overdueAmount.toFixed(2), overdueCount: result.overdueCount,
        dueSoonAmount: result.dueSoonAmount.toFixed(2), dueSoonCount: result.dueSoonCount, paidThisMonth: result.paidThisMonth.toFixed(2), paidThisMonthCount: result.paidThisMonthCount }, cashFlow };
  }
}
