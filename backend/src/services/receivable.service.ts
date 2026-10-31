import { AuditAction, AuditEntity, FinancialTitleType, Prisma, ReceivableStatus, UserRole } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { utcToday } from '../repositories/payable.repository.js';
import { receivableInclude, PrismaReceivableRepository } from '../repositories/receivable.repository.js';
import type { ListReceivablesQuery, ReceivableSummaryQuery, RegisterCollectionInput, ReverseCollectionInput, StatementQuery } from '../schemas/receivable.schema.js';
import { effectiveReceivableStatus } from '../types/receivable.js';
import type { AuditLogger } from './audit.service.js';
import { FinancialSettlementService } from './financial-settlement.service.js';

function withEffectiveStatus<T extends { status: ReceivableStatus; dueDate: Date }>(record: T, today: Date) {
  return { ...record, status: effectiveReceivableStatus(record.status, record.dueDate, today) };
}

export class ReceivableService {
  constructor(private readonly receivables: PrismaReceivableRepository, private readonly audit: AuditLogger) {}

  async list(query: ListReceivablesQuery) {
    const today = utcToday(); const { records, total } = await this.receivables.list(query, today);
    return { data: records.map((record) => withEffectiveStatus(record, today)), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
  async getById(id: string) {
    const receivable = await this.receivables.findById(id);
    if (!receivable) throw new AppError('Conta a receber não encontrada.', 404, 'RECEIVABLE_NOT_FOUND');
    return withEffectiveStatus(receivable, utcToday());
  }
  registerCollection(id: string, input: RegisterCollectionInput, actor: string) {
    return new FinancialSettlementService(this.audit).settleReceivable(id, { amount: input.amount, method: input.method, bankAccountId: input.bankAccountId,
      ...(input.receivedAt ? { settledAt: input.receivedAt } : {}), ...(input.notes ? { notes: input.notes } : {}), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) }, actor);
  }
  reverseCollection(id: string, collectionId: string, input: ReverseCollectionInput, role: UserRole, actor: string) {
    return new FinancialSettlementService(this.audit).reverse(FinancialTitleType.RECEIVABLE, id, collectionId, input.reason, role, actor);
  }
  cancel(id: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem cancelar contas a receber.', 403, 'RECEIVABLE_CANCEL_FORBIDDEN');
    return this.receivables.transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "receivables" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new AppError('Conta a receber não encontrada.', 404, 'RECEIVABLE_NOT_FOUND');
      const receivable = await tx.receivable.findUnique({ where: { id } });
      if (!receivable) throw new AppError('Conta a receber não encontrada.', 404, 'RECEIVABLE_NOT_FOUND');
      if (receivable.status === ReceivableStatus.CANCELLED) return withEffectiveStatus(await tx.receivable.findUniqueOrThrow({ where: { id }, include: receivableInclude }), utcToday());
      if (!receivable.receivedAmount.eq(0)) throw new AppError('Estorne os recebimentos antes de cancelar a conta.', 409, 'RECEIVABLE_HAS_COLLECTIONS');
      await tx.receivable.update({ where: { id }, data: { status: ReceivableStatus.CANCELLED } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.RECEIVABLE, entityId: id, action: AuditAction.CANCEL,
        oldData: { status: receivable.status }, newData: { status: ReceivableStatus.CANCELLED } }, tx);
      return withEffectiveStatus(await tx.receivable.findUniqueOrThrow({ where: { id }, include: receivableInclude }), utcToday());
    });
  }
  async summary(query: ReceivableSummaryQuery) {
    const today = utcToday(); const result = await this.receivables.summary(query.days, today);
    const incoming = new Map<string, Prisma.Decimal>(); const outgoing = new Map<string, Prisma.Decimal>();
    for (const row of result.incomingFlow) { const key = row.dueDate.toISOString().slice(0, 10); incoming.set(key, (incoming.get(key) ?? new Prisma.Decimal(0)).add(row.originalAmount.add(row.interestAmount).add(row.penaltyAmount).sub(row.discountAmount).sub(row.receivedAmount))); }
    for (const row of result.outgoingFlow) { const key = row.dueDate.toISOString().slice(0, 10); outgoing.set(key, (outgoing.get(key) ?? new Prisma.Decimal(0)).add(row.originalAmount.add(row.interestAmount).add(row.penaltyAmount).sub(row.discountAmount).sub(row.paidAmount))); }
    const cashFlow = Array.from({ length: query.days }, (_, index) => { const date = new Date(today.getTime() + index * 86_400_000).toISOString().slice(0, 10); const entries = incoming.get(date) ?? new Prisma.Decimal(0); const exits = outgoing.get(date) ?? new Prisma.Decimal(0); return { date, entries: entries.toFixed(2), exits: exits.toFixed(2), net: entries.sub(exits).toFixed(2) }; });
    return { generatedAt: new Date().toISOString(), period: { from: today.toISOString().slice(0, 10), to: new Date(result.end.getTime() - 1).toISOString().slice(0, 10), days: query.days },
      metrics: { billedAmount: result.billedAmount.toFixed(2), receivedAmount: result.receivedAmount.toFixed(2), openAmount: result.openAmount.toFixed(2), openCount: result.openCount,
        overdueAmount: result.overdueAmount.toFixed(2), overdueCount: result.overdueCount, collectedThisMonth: result.collectedThisMonth.toFixed(2), collectedThisMonthCount: result.collectedThisMonthCount }, cashFlow };
  }
  async statement(clientId: string, query: StatementQuery) {
    const today = utcToday(); const result = await this.receivables.statement(clientId, query.page, query.pageSize);
    if (!result) throw new AppError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND');
    const originalAmount = result.totals.reduce((sum, row) => sum.add(row.originalAmount), new Prisma.Decimal(0));
    const receivedAmount = result.totals.reduce((sum, row) => sum.add(row.receivedAmount), new Prisma.Decimal(0));
    const overdueAmount = result.totals.filter((row) => effectiveReceivableStatus(row.status, row.dueDate, today) === 'OVERDUE').reduce((sum, row) => sum.add(row.originalAmount.sub(row.receivedAmount)), new Prisma.Decimal(0));
    return { client: result.client, metrics: { billedAmount: originalAmount.toFixed(2), receivedAmount: receivedAmount.toFixed(2), openAmount: originalAmount.sub(receivedAmount).toFixed(2), overdueAmount: overdueAmount.toFixed(2) },
      data: result.records.map((record) => withEffectiveStatus(record, today)), pagination: { page: query.page, pageSize: query.pageSize, total: result.total, totalPages: Math.ceil(result.total / query.pageSize) } };
  }
}
