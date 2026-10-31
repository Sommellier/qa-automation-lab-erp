import { createHash } from 'node:crypto';
import {
  AuditAction,
  AuditEntity,
  BankMovementNature,
  BankMovementType,
  ChartAccountKind,
  FinancialAdjustmentKind,
  FinancialRecurrenceStatus,
  FinancialTitleOrigin,
  FinancialTitleType,
  PayableStatus,
  Prisma,
  ReceivableStatus,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type {
  CreateBankAccountInput,
  CreateChartAccountInput,
  CreateCostCenterInput,
  CreateFinancialAdjustmentInput,
  CreateFinancialTitleInput,
  CreateRecurrenceInput,
  ListFinancialTitlesQuery,
  TransferInput,
  UpdateBankAccountInput,
  UpdateChartAccountInput,
  UpdateCostCenterInput,
  UpdateFinancialTitleInput,
  UpdateRecurrenceInput,
} from '../schemas/finance.schema.js';
import type { AuditLogger } from './audit.service.js';
import {
  adjustedTitleAmount,
  allocateByPercentage,
  calculateFinancialAdjustment,
  money,
  nextRecurrenceDate,
} from './financial-rules.js';
import { payableFinanceInclude, receivableFinanceInclude } from './financial-settlement.service.js';
import { financialTransaction, nextBankMovementNumber } from './financial-transaction.js';

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function titleStatus(type: FinancialTitleType, record: { status: string; dueDate: Date }, openAmount: Prisma.Decimal): string {
  if (record.status === 'DRAFT') return 'DRAFT';
  if (record.status === 'CANCELLED') return 'CANCELLED';
  if (type === FinancialTitleType.PAYABLE && record.status === PayableStatus.PAID) return 'SETTLED';
  if (type === FinancialTitleType.RECEIVABLE && record.status === ReceivableStatus.RECEIVED) return 'SETTLED';
  if (record.dueDate < utcToday() && openAmount.gt(0)) return 'OVERDUE';
  if (type === FinancialTitleType.PAYABLE && record.status === PayableStatus.PARTIALLY_PAID) return 'PARTIALLY_SETTLED';
  if (type === FinancialTitleType.RECEIVABLE && record.status === ReceivableStatus.PARTIALLY_RECEIVED) return 'PARTIALLY_SETTLED';
  return 'OPEN';
}

function payableView<T extends { number: string; originalAmount: Prisma.Decimal; interestAmount: Prisma.Decimal; penaltyAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; status: string; dueDate: Date }>(record: T) {
  const adjustedAmount = adjustedTitleAmount(record); const openAmount = money(adjustedAmount.sub(record.paidAmount));
  return { ...record, type: FinancialTitleType.PAYABLE, settledAmount: record.paidAmount, adjustedAmount, openAmount, effectiveStatus: titleStatus(FinancialTitleType.PAYABLE, record, openAmount) };
}
function receivableView<T extends { number: string; originalAmount: Prisma.Decimal; interestAmount: Prisma.Decimal; penaltyAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; receivedAmount: Prisma.Decimal; status: string; dueDate: Date }>(record: T) {
  const adjustedAmount = adjustedTitleAmount(record); const openAmount = money(adjustedAmount.sub(record.receivedAmount));
  return { ...record, type: FinancialTitleType.RECEIVABLE, settledAmount: record.receivedAmount, adjustedAmount, openAmount, effectiveStatus: titleStatus(FinancialTitleType.RECEIVABLE, record, openAmount) };
}

async function requireAnalyticalAccount(transaction: Prisma.TransactionClient, id: string) {
  const account = await transaction.chartAccount.findUnique({ where: { id } });
  if (!account) throw new AppError('Conta do plano de contas não encontrada.', 404, 'CHART_ACCOUNT_NOT_FOUND');
  if (!account.active || account.kind !== ChartAccountKind.ANALYTICAL) throw new AppError('Use uma conta analítica ativa para classificar o lançamento.', 409, 'CHART_ACCOUNT_NOT_ANALYTICAL');
  return account;
}

async function requireCostCenters(transaction: Prisma.TransactionClient, ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new AppError('Um centro de custo não pode aparecer duas vezes no rateio.', 400, 'DUPLICATE_COST_CENTER_ALLOCATION');
  const centers = await transaction.costCenter.findMany({ where: { id: { in: ids }, active: true } });
  if (centers.length !== ids.length) throw new AppError('Há centro de custo inexistente ou inativo no rateio.', 409, 'INVALID_COST_CENTER_ALLOCATION');
}

async function nextTitleNumber(transaction: Prisma.TransactionClient, type: FinancialTitleType) {
  if (type === FinancialTitleType.PAYABLE) {
    const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('payable_number_seq') AS value`;
    return `CP-${rows[0]!.value.toString().padStart(6, '0')}`;
  }
  const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('receivable_number_seq') AS value`;
  return `CR-${rows[0]!.value.toString().padStart(6, '0')}`;
}

export class FinanceService {
  constructor(private readonly audit: AuditLogger) {}

  async setup() {
    const [costCenters, chartAccounts, bankAccounts] = await Promise.all([this.listCostCenters(), this.listChartAccounts(), this.listBankAccounts()]);
    return { costCenters, chartAccounts, bankAccounts };
  }

  listCostCenters() {
    return prisma.costCenter.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], include: { _count: { select: { allocations: true, children: true } } } });
  }

  createCostCenter(input: CreateCostCenterInput, actor: string) {
    return financialTransaction(async (transaction) => {
      if (input.parentId) {
        const parent = await transaction.costCenter.findUnique({ where: { id: input.parentId } });
        if (!parent?.active) throw new AppError('Centro de custo pai não encontrado ou inativo.', 409, 'COST_CENTER_PARENT_INVALID');
      }
      const data: Prisma.CostCenterUncheckedCreateInput = { code: input.code, name: input.name, createdById: actor,
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}) };
      const created = await transaction.costCenter.create({ data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.COST_CENTER, entityId: created.id, action: AuditAction.CREATE, newData: created }, transaction);
      return created;
    });
  }

  updateCostCenter(id: string, input: UpdateCostCenterInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const current = await transaction.costCenter.findUnique({ where: { id } });
      if (!current) throw new AppError('Centro de custo não encontrado.', 404, 'COST_CENTER_NOT_FOUND');
      if (input.parentId === id) throw new AppError('O centro de custo não pode ser pai de si mesmo.', 400, 'COST_CENTER_CYCLE');
      if (input.parentId) {
        const descendants = await transaction.$queryRaw<Array<{ id: string }>>`
          WITH RECURSIVE descendants AS (SELECT "id" FROM "cost_centers" WHERE "parent_id" = ${id}::uuid UNION ALL
            SELECT c."id" FROM "cost_centers" c JOIN descendants d ON c."parent_id" = d."id") SELECT "id" FROM descendants`;
        if (descendants.some((item) => item.id === input.parentId)) throw new AppError('A hierarquia informada criaria um ciclo.', 400, 'COST_CENTER_CYCLE');
      }
      if (input.active === false) {
        const uses = await transaction.financialAllocation.count({ where: { costCenterId: id, OR: [{ payable: { status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID, PayableStatus.DRAFT] } } }, { receivable: { status: { in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED, ReceivableStatus.DRAFT] } } }] } });
        if (uses) throw new AppError('Centro de custo possui títulos ativos e não pode ser inativado.', 409, 'COST_CENTER_IN_USE');
      }
      const data: Prisma.CostCenterUncheckedUpdateInput = {
        ...(input.code !== undefined ? { code: input.code } : {}), ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      const updated = await transaction.costCenter.update({ where: { id }, data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.COST_CENTER, entityId: id, action: AuditAction.UPDATE, oldData: current, newData: updated }, transaction);
      return updated;
    });
  }

  listChartAccounts() {
    return prisma.chartAccount.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], include: { _count: { select: { payables: true, receivables: true, children: true } } } });
  }

  createChartAccount(input: CreateChartAccountInput, actor: string) {
    return financialTransaction(async (transaction) => {
      if (input.parentId) {
        const parent = await transaction.chartAccount.findUnique({ where: { id: input.parentId } });
        if (!parent?.active || parent.kind !== ChartAccountKind.SYNTHETIC) throw new AppError('A conta pai deve ser sintética e ativa.', 409, 'CHART_ACCOUNT_PARENT_INVALID');
      }
      const data: Prisma.ChartAccountUncheckedCreateInput = { code: input.code, name: input.name, kind: input.kind, nature: input.nature, createdById: actor,
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}) };
      const created = await transaction.chartAccount.create({ data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.CHART_ACCOUNT, entityId: created.id, action: AuditAction.CREATE, newData: created }, transaction);
      return created;
    });
  }

  updateChartAccount(id: string, input: UpdateChartAccountInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const current = await transaction.chartAccount.findUnique({ where: { id } });
      if (!current) throw new AppError('Conta do plano de contas não encontrada.', 404, 'CHART_ACCOUNT_NOT_FOUND');
      if (input.parentId === id) throw new AppError('A conta não pode ser pai de si mesma.', 400, 'CHART_ACCOUNT_CYCLE');
      if (input.parentId) {
        const parent = await transaction.chartAccount.findUnique({ where: { id: input.parentId } });
        if (!parent?.active || parent.kind !== ChartAccountKind.SYNTHETIC) throw new AppError('A conta pai deve ser sintética e ativa.', 409, 'CHART_ACCOUNT_PARENT_INVALID');
        const descendants = await transaction.$queryRaw<Array<{ id: string }>>`
          WITH RECURSIVE descendants AS (SELECT "id" FROM "chart_accounts" WHERE "parent_id" = ${id}::uuid UNION ALL
            SELECT c."id" FROM "chart_accounts" c JOIN descendants d ON c."parent_id" = d."id") SELECT "id" FROM descendants`;
        if (descendants.some((item) => item.id === input.parentId)) throw new AppError('A hierarquia informada criaria um ciclo.', 400, 'CHART_ACCOUNT_CYCLE');
      }
      if (input.kind === ChartAccountKind.SYNTHETIC) {
        const uses = await transaction.payable.count({ where: { chartAccountId: id } }) + await transaction.receivable.count({ where: { chartAccountId: id } });
        if (uses) throw new AppError('Conta analítica em uso não pode ser transformada em sintética.', 409, 'CHART_ACCOUNT_IN_USE');
      }
      const data: Prisma.ChartAccountUncheckedUpdateInput = {
        ...(input.code !== undefined ? { code: input.code } : {}), ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.nature !== undefined ? { nature: input.nature } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      const updated = await transaction.chartAccount.update({ where: { id }, data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.CHART_ACCOUNT, entityId: id, action: AuditAction.UPDATE, oldData: current, newData: updated }, transaction);
      return updated;
    });
  }

  async listBankAccounts() {
    const accounts = await prisma.bankAccount.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    const balances = await prisma.bankMovement.groupBy({ by: ['bankAccountId', 'nature'], where: { reversedAt: null }, _sum: { amount: true } });
    return accounts.map((account) => {
      const credit = balances.find((item) => item.bankAccountId === account.id && item.nature === BankMovementNature.CREDIT)?._sum.amount ?? new Prisma.Decimal(0);
      const debit = balances.find((item) => item.bankAccountId === account.id && item.nature === BankMovementNature.DEBIT)?._sum.amount ?? new Prisma.Decimal(0);
      return { ...account, currentBalance: money(account.initialBalance.add(credit).sub(debit)) };
    });
  }

  createBankAccount(input: CreateBankAccountInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const data: Prisma.BankAccountUncheckedCreateInput = { name: input.name, type: input.type, currency: input.currency,
        initialBalance: money(input.initialBalance), initialBalanceDate: input.initialBalanceDate, createdById: actor,
        ...(input.institution !== undefined ? { institution: input.institution } : {}), ...(input.agency !== undefined ? { agency: input.agency } : {}),
        ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}), ...(input.holder !== undefined ? { holder: input.holder } : {}) };
      const created = await transaction.bankAccount.create({ data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_ACCOUNT, entityId: created.id, action: AuditAction.CREATE, newData: { ...created, accountNumber: created.accountNumber ? '***' : null } }, transaction);
      return { ...created, currentBalance: created.initialBalance };
    });
  }

  updateBankAccount(id: string, input: UpdateBankAccountInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const current = await transaction.bankAccount.findUnique({ where: { id } });
      if (!current) throw new AppError('Conta financeira não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
      const movementCount = await transaction.bankMovement.count({ where: { bankAccountId: id } });
      if (movementCount && (input.initialBalance !== undefined || input.initialBalanceDate !== undefined)) throw new AppError('Saldo inicial não pode ser alterado após existirem movimentações; registre um ajuste rastreável.', 409, 'BANK_INITIAL_BALANCE_LOCKED');
      const data: Prisma.BankAccountUncheckedUpdateInput = {
        ...(input.name !== undefined ? { name: input.name } : {}), ...(input.institution !== undefined ? { institution: input.institution } : {}),
        ...(input.agency !== undefined ? { agency: input.agency } : {}), ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}), ...(input.holder !== undefined ? { holder: input.holder } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}), ...(input.initialBalance !== undefined ? { initialBalance: money(input.initialBalance) } : {}),
        ...(input.initialBalanceDate !== undefined ? { initialBalanceDate: input.initialBalanceDate } : {}), ...(input.active !== undefined ? { active: input.active } : {}),
      };
      const updated = await transaction.bankAccount.update({ where: { id }, data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_ACCOUNT, entityId: id, action: AuditAction.UPDATE, oldData: current, newData: updated }, transaction);
      return updated;
    });
  }

  async listTitles(query: ListFinancialTitlesQuery) {
    const commonDate = query.dueFrom || query.dueTo ? { dueDate: { ...(query.dueFrom ? { gte: query.dueFrom } : {}), ...(query.dueTo ? { lte: query.dueTo } : {}) } } : {};
    const costFilter = query.costCenterId ? { allocations: { some: { costCenterId: query.costCenterId } } } : {};
    const payableWhere: Prisma.PayableWhereInput = { ...commonDate, ...costFilter,
      ...(query.chartAccountId ? { chartAccountId: query.chartAccountId } : {}), ...(query.bankAccountId ? { plannedBankAccountId: query.bankAccountId } : {}),
      ...(query.search ? { OR: [{ number: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }, { counterpartyName: { contains: query.search, mode: 'insensitive' } }, { supplier: { is: { name: { contains: query.search, mode: 'insensitive' } } } }] } : {}) };
    const receivableWhere: Prisma.ReceivableWhereInput = { ...commonDate, ...costFilter,
      ...(query.chartAccountId ? { chartAccountId: query.chartAccountId } : {}), ...(query.bankAccountId ? { plannedBankAccountId: query.bankAccountId } : {}),
      ...(query.search ? { OR: [{ number: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }, { counterpartyName: { contains: query.search, mode: 'insensitive' } }, { client: { is: { name: { contains: query.search, mode: 'insensitive' } } } }] } : {}) };
    const [payables, receivables] = await Promise.all([
      query.type === FinancialTitleType.RECEIVABLE ? Promise.resolve([]) : prisma.payable.findMany({ where: payableWhere, include: { supplier: { select: { id: true, name: true } }, chartAccount: true, allocations: { include: { costCenter: true } }, plannedBankAccount: { select: { id: true, name: true } } } }),
      query.type === FinancialTitleType.PAYABLE ? Promise.resolve([]) : prisma.receivable.findMany({ where: receivableWhere, include: { client: { select: { id: true, name: true } }, chartAccount: true, allocations: { include: { costCenter: true } }, plannedBankAccount: { select: { id: true, name: true } } } }),
    ]);
    const all = [...payables.map(payableView), ...receivables.map(receivableView)]
      .filter((item) => !query.status || item.effectiveStatus === query.status)
      .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime() || left.number.localeCompare(right.number));
    const start = (query.page - 1) * query.pageSize;
    return { data: all.slice(start, start + query.pageSize), pagination: { page: query.page, pageSize: query.pageSize, total: all.length, totalPages: Math.ceil(all.length / query.pageSize) } };
  }

  async getTitle(type: FinancialTitleType, id: string) {
    const record = type === FinancialTitleType.PAYABLE
      ? await prisma.payable.findUnique({ where: { id }, include: payableFinanceInclude })
      : await prisma.receivable.findUnique({ where: { id }, include: receivableFinanceInclude });
    if (!record) throw new AppError('Lançamento financeiro não encontrado.', 404, 'FINANCIAL_TITLE_NOT_FOUND');
    const history = await prisma.auditLog.findMany({ where: { entityType: AuditEntity.FINANCIAL_TITLE, entityId: id }, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, email: true } } } });
    return { ...(type === FinancialTitleType.PAYABLE ? payableView(record as Prisma.PayableGetPayload<{ include: typeof payableFinanceInclude }>) : receivableView(record as Prisma.ReceivableGetPayload<{ include: typeof receivableFinanceInclude }>)), history };
  }

  createTitle(input: CreateFinancialTitleInput, actor: string) {
    return financialTransaction(async (transaction) => {
      await requireAnalyticalAccount(transaction, input.chartAccountId);
      await requireCostCenters(transaction, input.allocations.map((item) => item.costCenterId));
      if (input.supplierId && !(await transaction.supplier.findFirst({ where: { id: input.supplierId, active: true } }))) throw new AppError('Fornecedor não encontrado ou inativo.', 409, 'SUPPLIER_INVALID');
      if (input.clientId && !(await transaction.client.findFirst({ where: { id: input.clientId, active: true } }))) throw new AppError('Cliente não encontrado ou inativo.', 409, 'CLIENT_INVALID');
      if (input.plannedBankAccountId && !(await transaction.bankAccount.findFirst({ where: { id: input.plannedBankAccountId, active: true } }))) throw new AppError('Conta financeira prevista inválida.', 409, 'BANK_ACCOUNT_INVALID');
      const allocations = allocateByPercentage(input.originalAmount, input.allocations);
      const number = await nextTitleNumber(transaction, input.type);
      const common = { number, description: input.description, chartAccountId: input.chartAccountId,
        competenceDate: input.competenceDate, issueDate: input.issueDate, dueDate: input.dueDate, originalAmount: money(input.originalAmount),
        origin: FinancialTitleOrigin.MANUAL, createdById: actor, allocations: { create: allocations },
        ...(input.counterpartyName !== undefined ? { counterpartyName: input.counterpartyName } : {}),
        ...(input.plannedMethod !== undefined ? { plannedMethod: input.plannedMethod } : {}),
        ...(input.plannedBankAccountId !== undefined ? { plannedBankAccountId: input.plannedBankAccountId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}) };
      const created = input.type === FinancialTitleType.PAYABLE
        ? await transaction.payable.create({ data: { ...common, supplierId: input.supplierId ?? null, status: input.draft ? PayableStatus.DRAFT : PayableStatus.PENDING }, include: payableFinanceInclude })
        : await transaction.receivable.create({ data: { ...common, clientId: input.clientId ?? null, status: input.draft ? ReceivableStatus.DRAFT : ReceivableStatus.PENDING }, include: receivableFinanceInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: created.id, action: AuditAction.CREATE, newData: { type: input.type, number, description: input.description, originalAmount: input.originalAmount, allocations } }, transaction);
      return input.type === FinancialTitleType.PAYABLE ? payableView(created as Prisma.PayableGetPayload<{ include: typeof payableFinanceInclude }>) : receivableView(created as Prisma.ReceivableGetPayload<{ include: typeof receivableFinanceInclude }>);
    });
  }

  updateTitle(type: FinancialTitleType, id: string, input: UpdateFinancialTitleInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const table = type === FinancialTitleType.PAYABLE ? 'payables' : 'receivables';
      await transaction.$queryRawUnsafe(`SELECT "id" FROM "${table}" WHERE "id" = $1::uuid FOR UPDATE`, id);
      const current = type === FinancialTitleType.PAYABLE ? await transaction.payable.findUnique({ where: { id } }) : await transaction.receivable.findUnique({ where: { id } });
      if (!current) throw new AppError('Lançamento financeiro não encontrado.', 404, 'FINANCIAL_TITLE_NOT_FOUND');
      if (current.status === 'CANCELLED' || current.status === 'PAID' || current.status === 'RECEIVED') throw new AppError('Lançamento liquidado ou cancelado não pode ser editado.', 409, 'FINANCIAL_TITLE_NOT_EDITABLE');
      const settled = type === FinancialTitleType.PAYABLE ? (current as typeof current & { paidAmount: Prisma.Decimal }).paidAmount : (current as typeof current & { receivedAmount: Prisma.Decimal }).receivedAmount;
      if (input.originalAmount !== undefined && !settled.eq(0)) throw new AppError('Valor original não pode ser alterado após liquidações.', 409, 'FINANCIAL_TITLE_VALUE_LOCKED');
      if (input.chartAccountId) await requireAnalyticalAccount(transaction, input.chartAccountId);
      const finalAmount = input.originalAmount ?? current.originalAmount;
      if (input.allocations) {
        await requireCostCenters(transaction, input.allocations.map((item) => item.costCenterId));
        const allocations = allocateByPercentage(finalAmount, input.allocations);
        await transaction.financialAllocation.deleteMany({ where: type === FinancialTitleType.PAYABLE ? { payableId: id } : { receivableId: id } });
        await transaction.financialAllocation.createMany({ data: allocations.map((item) => ({ ...item, ...(type === FinancialTitleType.PAYABLE ? { payableId: id } : { receivableId: id }) })) });
      } else if (input.originalAmount !== undefined) {
        const existing = await transaction.financialAllocation.findMany({ where: type === FinancialTitleType.PAYABLE ? { payableId: id } : { receivableId: id } });
        const allocations = allocateByPercentage(finalAmount, existing.map((item) => ({ costCenterId: item.costCenterId, percentage: item.percentage })));
        for (const allocation of allocations) await transaction.financialAllocation.update({ where: { id: existing.find((item) => item.costCenterId === allocation.costCenterId)!.id }, data: { amount: allocation.amount } });
      }
      const status = input.postDraft && current.status === 'DRAFT' ? (type === FinancialTitleType.PAYABLE ? PayableStatus.PENDING : ReceivableStatus.PENDING) : undefined;
      const commonData = {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.counterpartyName !== undefined ? { counterpartyName: input.counterpartyName } : {}),
        ...(input.chartAccountId !== undefined ? { chartAccountId: input.chartAccountId } : {}),
        ...(input.competenceDate !== undefined ? { competenceDate: input.competenceDate } : {}),
        ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}), ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.originalAmount !== undefined ? { originalAmount: money(input.originalAmount) } : {}),
        ...(input.plannedMethod !== undefined ? { plannedMethod: input.plannedMethod } : {}),
        ...(input.plannedBankAccountId !== undefined ? { plannedBankAccountId: input.plannedBankAccountId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(status ? { status } : {}),
      };
      const updated = type === FinancialTitleType.PAYABLE
        ? await transaction.payable.update({ where: { id }, data: { ...commonData, ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}) }, include: payableFinanceInclude })
        : await transaction.receivable.update({ where: { id }, data: { ...commonData, ...(input.clientId !== undefined ? { clientId: input.clientId } : {}) }, include: receivableFinanceInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.UPDATE, oldData: current, newData: commonData }, transaction);
      return type === FinancialTitleType.PAYABLE ? payableView(updated as Prisma.PayableGetPayload<{ include: typeof payableFinanceInclude }>) : receivableView(updated as Prisma.ReceivableGetPayload<{ include: typeof receivableFinanceInclude }>);
    });
  }

  cancelTitle(type: FinancialTitleType, id: string, reason: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem cancelar lançamentos.', 403, 'FINANCIAL_TITLE_CANCEL_FORBIDDEN');
    return financialTransaction(async (transaction) => {
      const current = type === FinancialTitleType.PAYABLE ? await transaction.payable.findUnique({ where: { id } }) : await transaction.receivable.findUnique({ where: { id } });
      if (!current) throw new AppError('Lançamento financeiro não encontrado.', 404, 'FINANCIAL_TITLE_NOT_FOUND');
      const settled = type === FinancialTitleType.PAYABLE ? (current as typeof current & { paidAmount: Prisma.Decimal }).paidAmount : (current as typeof current & { receivedAmount: Prisma.Decimal }).receivedAmount;
      if (!settled.eq(0)) throw new AppError('Estorne todas as liquidações antes de cancelar.', 409, 'FINANCIAL_TITLE_HAS_SETTLEMENTS');
      const updated = type === FinancialTitleType.PAYABLE
        ? await transaction.payable.update({ where: { id }, data: { status: PayableStatus.CANCELLED }, include: payableFinanceInclude })
        : await transaction.receivable.update({ where: { id }, data: { status: ReceivableStatus.CANCELLED }, include: receivableFinanceInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.CANCEL, oldData: { status: current.status }, newData: { status: 'CANCELLED', reason } }, transaction);
      return type === FinancialTitleType.PAYABLE ? payableView(updated as Prisma.PayableGetPayload<{ include: typeof payableFinanceInclude }>) : receivableView(updated as Prisma.ReceivableGetPayload<{ include: typeof receivableFinanceInclude }>);
    });
  }

  applyAdjustment(type: FinancialTitleType, id: string, input: CreateFinancialAdjustmentInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const current = type === FinancialTitleType.PAYABLE ? await transaction.payable.findUnique({ where: { id } }) : await transaction.receivable.findUnique({ where: { id } });
      if (!current) throw new AppError('Lançamento financeiro não encontrado.', 404, 'FINANCIAL_TITLE_NOT_FOUND');
      if (['DRAFT', 'CANCELLED', 'PAID', 'RECEIVED'].includes(current.status)) throw new AppError('O lançamento não aceita ajustes neste estado.', 409, 'FINANCIAL_ADJUSTMENT_NOT_ALLOWED');
      const settled = type === FinancialTitleType.PAYABLE ? (current as typeof current & { paidAmount: Prisma.Decimal }).paidAmount : (current as typeof current & { receivedAmount: Prisma.Decimal }).receivedAmount;
      const baseAmount = adjustedTitleAmount(current).sub(settled);
      const calculation = calculateFinancialAdjustment({ kind: input.kind, calculationType: input.calculationType, baseAmount,
        ...(input.fixedAmount !== undefined ? { fixedAmount: input.fixedAmount } : {}), ...(input.rate !== undefined ? { rate: input.rate } : {}),
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}), ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}) });
      const appliedAmount = money(input.appliedAmount ?? calculation.calculatedAmount);
      if (appliedAmount.gt(calculation.calculatedAmount)) throw new AppError('O valor aplicado não pode exceder o valor calculado.', 409, 'ADJUSTMENT_APPLIED_EXCEEDS_CALCULATED');
      if (input.kind === FinancialAdjustmentKind.DISCOUNT && appliedAmount.gt(baseAmount)) throw new AppError('Desconto não pode exceder o saldo exigível.', 409, 'DISCOUNT_EXCEEDS_BALANCE');
      const where = type === FinancialTitleType.PAYABLE ? { payableId: id } : { receivableId: id };
      const duplicate = await transaction.financialAdjustment.findFirst({ where: { ...where, kind: input.kind, periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null, reversedAt: null } });
      if (duplicate) throw new AppError('Já existe ajuste ativo do mesmo tipo para este período.', 409, 'DUPLICATE_FINANCIAL_ADJUSTMENT');
      const adjustment = await transaction.financialAdjustment.create({ data: { ...where, kind: input.kind, calculationType: input.calculationType,
        ...(input.rate !== undefined ? { rate: input.rate } : {}), baseAmount: calculation.baseAmount,
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}), ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}),
        calculatedAmount: calculation.calculatedAmount, appliedAmount, reason: input.reason, calculationMemory: calculation.memory, createdById: actor } });
      const field = input.kind === FinancialAdjustmentKind.INTEREST ? 'interestAmount' : input.kind === FinancialAdjustmentKind.PENALTY ? 'penaltyAmount' : 'discountAmount';
      const newValue = (current[field] as Prisma.Decimal).add(appliedAmount);
      if (type === FinancialTitleType.PAYABLE) await transaction.payable.update({ where: { id }, data: { [field]: newValue } });
      else await transaction.receivable.update({ where: { id }, data: { [field]: newValue } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.ADJUST, oldData: { [field]: current[field] }, newData: { adjustmentId: adjustment.id, kind: input.kind, [field]: newValue, memory: calculation.memory } }, transaction);
      return adjustment;
    });
  }

  reverseAdjustment(adjustmentId: string, reason: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem reverter ajustes.', 403, 'ADJUSTMENT_REVERSAL_FORBIDDEN');
    return financialTransaction(async (transaction) => {
      const adjustment = await transaction.financialAdjustment.findUnique({ where: { id: adjustmentId } });
      if (!adjustment) throw new AppError('Ajuste financeiro não encontrado.', 404, 'FINANCIAL_ADJUSTMENT_NOT_FOUND');
      if (adjustment.reversedAt) throw new AppError('Ajuste já revertido.', 409, 'FINANCIAL_ADJUSTMENT_ALREADY_REVERSED');
      const type = adjustment.payableId ? FinancialTitleType.PAYABLE : FinancialTitleType.RECEIVABLE;
      const id = adjustment.payableId ?? adjustment.receivableId!;
      const current = type === FinancialTitleType.PAYABLE ? await transaction.payable.findUniqueOrThrow({ where: { id } }) : await transaction.receivable.findUniqueOrThrow({ where: { id } });
      const field = adjustment.kind === FinancialAdjustmentKind.INTEREST ? 'interestAmount' : adjustment.kind === FinancialAdjustmentKind.PENALTY ? 'penaltyAmount' : 'discountAmount';
      const newValue = (current[field] as Prisma.Decimal).sub(adjustment.appliedAmount);
      const resulting = adjustedTitleAmount({ ...current, [field]: newValue });
      const settled = type === FinancialTitleType.PAYABLE ? (current as typeof current & { paidAmount: Prisma.Decimal }).paidAmount : (current as typeof current & { receivedAmount: Prisma.Decimal }).receivedAmount;
      if (resulting.lt(settled)) throw new AppError('A reversão reduziria o valor abaixo do montante já liquidado.', 409, 'ADJUSTMENT_REVERSAL_BELOW_SETTLED');
      if (type === FinancialTitleType.PAYABLE) await transaction.payable.update({ where: { id }, data: { [field]: newValue } });
      else await transaction.receivable.update({ where: { id }, data: { [field]: newValue } });
      const reversedAt = new Date();
      const updated = await transaction.financialAdjustment.update({ where: { id: adjustmentId }, data: { reversedAt, reversedById: actor, reversalReason: reason } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.ADJUST, oldData: { adjustmentId, [field]: current[field] }, newData: { reversed: true, reason, [field]: newValue } }, transaction);
      return updated;
    });
  }

  listRecurrences() {
    return prisma.financialRecurrence.findMany({ orderBy: [{ status: 'asc' }, { nextOccurrence: 'asc' }], include: { chartAccount: true, costCenter: true, supplier: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, plannedBankAccount: { select: { id: true, name: true } }, occurrences: { orderBy: { sequence: 'desc' }, take: 10 } } });
  }

  createRecurrence(input: CreateRecurrenceInput, actor: string) {
    return financialTransaction(async (transaction) => {
      await requireAnalyticalAccount(transaction, input.chartAccountId); await requireCostCenters(transaction, [input.costCenterId]);
      const data: Prisma.FinancialRecurrenceUncheckedCreateInput = { description: input.description, type: input.type, amount: money(input.amount),
        chartAccountId: input.chartAccountId, costCenterId: input.costCenterId, startDate: input.startDate, frequency: input.frequency,
        nextOccurrence: input.startDate, createdById: actor, ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}), ...(input.counterpartyName !== undefined ? { counterpartyName: input.counterpartyName } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}), ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
        ...(input.maxOccurrences !== undefined ? { maxOccurrences: input.maxOccurrences } : {}), ...(input.plannedMethod !== undefined ? { plannedMethod: input.plannedMethod } : {}),
        ...(input.plannedBankAccountId !== undefined ? { plannedBankAccountId: input.plannedBankAccountId } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) };
      const created = await transaction.financialRecurrence.create({ data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_RECURRENCE, entityId: created.id, action: AuditAction.CREATE, newData: created }, transaction);
      return created;
    });
  }

  updateRecurrence(id: string, input: UpdateRecurrenceInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const current = await transaction.financialRecurrence.findUnique({ where: { id } });
      if (!current) throw new AppError('Recorrência não encontrada.', 404, 'FINANCIAL_RECURRENCE_NOT_FOUND');
      if (current.status === FinancialRecurrenceStatus.CLOSED) throw new AppError('Recorrência encerrada não pode ser editada.', 409, 'FINANCIAL_RECURRENCE_CLOSED');
      if (input.chartAccountId) await requireAnalyticalAccount(transaction, input.chartAccountId);
      if (input.costCenterId) await requireCostCenters(transaction, [input.costCenterId]);
      const data: Prisma.FinancialRecurrenceUncheckedUpdateInput = {
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.amount !== undefined ? { amount: money(input.amount) } : {}),
        ...(input.chartAccountId !== undefined ? { chartAccountId: input.chartAccountId } : {}), ...(input.costCenterId !== undefined ? { costCenterId: input.costCenterId } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}), ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.counterpartyName !== undefined ? { counterpartyName: input.counterpartyName } : {}), ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}), ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}), ...(input.maxOccurrences !== undefined ? { maxOccurrences: input.maxOccurrences } : {}),
        ...(input.plannedMethod !== undefined ? { plannedMethod: input.plannedMethod } : {}), ...(input.plannedBankAccountId !== undefined ? { plannedBankAccountId: input.plannedBankAccountId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      };
      const updated = await transaction.financialRecurrence.update({ where: { id }, data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_RECURRENCE, entityId: id, action: AuditAction.UPDATE, oldData: current, newData: updated }, transaction);
      return updated;
    });
  }

  setRecurrenceStatus(id: string, action: 'suspend' | 'reactivate' | 'close', actor: string) {
    return financialTransaction(async (transaction) => {
      const current = await transaction.financialRecurrence.findUnique({ where: { id } });
      if (!current) throw new AppError('Recorrência não encontrada.', 404, 'FINANCIAL_RECURRENCE_NOT_FOUND');
      if (current.status === FinancialRecurrenceStatus.CLOSED && action !== 'close') throw new AppError('Recorrência encerrada não pode ser reativada.', 409, 'FINANCIAL_RECURRENCE_CLOSED');
      const status = action === 'suspend' ? FinancialRecurrenceStatus.SUSPENDED : action === 'reactivate' ? FinancialRecurrenceStatus.ACTIVE : FinancialRecurrenceStatus.CLOSED;
      const updated = await transaction.financialRecurrence.update({ where: { id }, data: { status } });
      const auditAction = action === 'suspend' ? AuditAction.SUSPEND : action === 'reactivate' ? AuditAction.REACTIVATE : AuditAction.CLOSE;
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_RECURRENCE, entityId: id, action: auditAction, oldData: { status: current.status }, newData: { status } }, transaction);
      return updated;
    });
  }

  async processRecurrences(throughDate: Date, actor: string) {
    const candidates = await prisma.financialRecurrence.findMany({ where: { status: FinancialRecurrenceStatus.ACTIVE, nextOccurrence: { lte: throughDate } }, select: { id: true } });
    const results: Array<{ recurrenceId: string; generated: number; error?: string }> = [];
    for (const candidate of candidates) {
      try {
        const generated = await financialTransaction(async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "financial_recurrences" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`;
          const recurrence = await transaction.financialRecurrence.findUniqueOrThrow({ where: { id: candidate.id } });
          if (recurrence.status !== FinancialRecurrenceStatus.ACTIVE) return 0;
          let next = recurrence.nextOccurrence; let count = recurrence.generatedOccurrences; let generatedCount = 0;
          while (next <= throughDate && (!recurrence.endDate || next <= recurrence.endDate) && (!recurrence.maxOccurrences || count < recurrence.maxOccurrences)) {
            const sequence = count + 1;
            const occurrence = await transaction.financialRecurrenceOccurrence.upsert({ where: { recurrenceId_sequence: { recurrenceId: recurrence.id, sequence } },
              create: { recurrenceId: recurrence.id, sequence, dueDate: next }, update: {} });
            if (occurrence.status !== 'GENERATED') {
              const number = await nextTitleNumber(transaction, recurrence.type);
              const common = { number, description: recurrence.description, counterpartyName: recurrence.counterpartyName, chartAccountId: recurrence.chartAccountId,
                competenceDate: next, issueDate: next, dueDate: next, originalAmount: recurrence.amount, plannedMethod: recurrence.plannedMethod,
                plannedBankAccountId: recurrence.plannedBankAccountId, notes: recurrence.notes, origin: FinancialTitleOrigin.RECURRENCE,
                createdById: actor, recurrenceOccurrenceId: occurrence.id, allocations: { create: [{ costCenterId: recurrence.costCenterId, percentage: new Prisma.Decimal(100), amount: recurrence.amount }] } };
              if (recurrence.type === FinancialTitleType.PAYABLE) await transaction.payable.create({ data: { ...common, supplierId: recurrence.supplierId } });
              else await transaction.receivable.create({ data: { ...common, clientId: recurrence.clientId } });
              await transaction.financialRecurrenceOccurrence.update({ where: { id: occurrence.id }, data: { status: 'GENERATED', generatedAt: new Date(), generatedById: actor } });
              generatedCount += 1;
            }
            count = sequence; next = nextRecurrenceDate(next, recurrence.frequency, recurrence.dueDay);
          }
          const closed = (recurrence.endDate && next > recurrence.endDate) || (recurrence.maxOccurrences && count >= recurrence.maxOccurrences);
          await transaction.financialRecurrence.update({ where: { id: recurrence.id }, data: { generatedOccurrences: count, nextOccurrence: next, ...(closed ? { status: FinancialRecurrenceStatus.CLOSED } : {}) } });
          await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_RECURRENCE, entityId: recurrence.id, action: AuditAction.GENERATE, newData: { generatedCount, throughDate, nextOccurrence: next } }, transaction);
          return generatedCount;
        });
        results.push({ recurrenceId: candidate.id, generated });
      } catch (error) {
        results.push({ recurrenceId: candidate.id, generated: 0, error: error instanceof Error ? error.message : 'Falha não identificada.' });
      }
    }
    return { processed: results.length, generated: results.reduce((sum, item) => sum + item.generated, 0), results };
  }

  transfer(input: TransferInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const accounts = await transaction.bankAccount.findMany({ where: { id: { in: [input.sourceBankAccountId, input.destinationBankAccountId] }, active: true } });
      if (accounts.length !== 2) throw new AppError('Conta de origem ou destino inválida.', 409, 'BANK_TRANSFER_ACCOUNT_INVALID');
      const transferredAt = input.transferredAt ?? new Date(); const groupId = crypto.randomUUID(); const amount = money(input.amount);
      const debit = await transaction.bankMovement.create({ data: { number: await nextBankMovementNumber(transaction), bankAccountId: input.sourceBankAccountId,
        nature: BankMovementNature.DEBIT, type: BankMovementType.TRANSFER, amount, postedAt: transferredAt, description: input.description,
        ...(input.reference !== undefined ? { externalReference: input.reference } : {}), transferGroupId: groupId, createdById: actor } });
      const credit = await transaction.bankMovement.create({ data: { number: await nextBankMovementNumber(transaction), bankAccountId: input.destinationBankAccountId,
        nature: BankMovementNature.CREDIT, type: BankMovementType.TRANSFER, amount, postedAt: transferredAt, description: input.description,
        ...(input.reference !== undefined ? { externalReference: input.reference } : {}), transferGroupId: groupId, createdById: actor } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_ACCOUNT, entityId: groupId, action: AuditAction.TRANSFER, newData: { sourceBankAccountId: input.sourceBankAccountId, destinationBankAccountId: input.destinationBankAccountId, amount, debitId: debit.id, creditId: credit.id } }, transaction);
      return { transferGroupId: groupId, debit, credit };
    });
  }

  listBankMovements(bankAccountId?: string) {
    return prisma.bankMovement.findMany({ where: bankAccountId ? { bankAccountId } : {}, orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }], take: 500,
      include: { bankAccount: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, reconciliationLinks: { include: { reconciliation: true, bankTransaction: true } } } });
  }

  addAttachment(type: FinancialTitleType, id: string, file: Express.Multer.File, actor: string) {
    return financialTransaction(async (transaction) => {
      const exists = type === FinancialTitleType.PAYABLE ? await transaction.payable.count({ where: { id } }) : await transaction.receivable.count({ where: { id } });
      if (!exists) throw new AppError('Lançamento financeiro não encontrado.', 404, 'FINANCIAL_TITLE_NOT_FOUND');
      const sha256 = createHash('sha256').update(file.buffer).digest('hex');
      const titleWhere = type === FinancialTitleType.PAYABLE ? { payableId: id } : { receivableId: id };
      const duplicate = await transaction.financialAttachment.findFirst({ where: { ...titleWhere, sha256, active: true } });
      if (duplicate) throw new AppError('Este comprovante já está anexado ao lançamento.', 409, 'DUPLICATE_FINANCIAL_ATTACHMENT');
      const created = await transaction.financialAttachment.create({ data: { ...titleWhere, fileName: file.originalname, contentType: file.mimetype,
        size: file.size, sha256, content: file.buffer, uploadedById: actor }, select: { id: true, fileName: true, contentType: true, size: true, sha256: true, createdAt: true } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.ATTACH, newData: created }, transaction);
      return created;
    });
  }

  async getAttachment(id: string) {
    const attachment = await prisma.financialAttachment.findFirst({ where: { id, active: true } });
    if (!attachment) throw new AppError('Comprovante não encontrado.', 404, 'FINANCIAL_ATTACHMENT_NOT_FOUND');
    return attachment;
  }

  removeAttachment(id: string, actor: string) {
    return financialTransaction(async (transaction) => {
      const attachment = await transaction.financialAttachment.findFirst({ where: { id, active: true } });
      if (!attachment) throw new AppError('Comprovante não encontrado.', 404, 'FINANCIAL_ATTACHMENT_NOT_FOUND');
      const updated = await transaction.financialAttachment.update({ where: { id }, data: { active: false, removedAt: new Date(), removedById: actor } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: attachment.payableId ?? attachment.receivableId!, action: AuditAction.REMOVE, oldData: { attachmentId: id, active: true }, newData: { active: false } }, transaction);
      return updated;
    });
  }
}
