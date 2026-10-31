import {
  AuditAction,
  AuditEntity,
  BankMovementNature,
  BankMovementType,
  ChartAccountNature,
  FinancialRecurrenceStatus,
  PayableStatus,
  Prisma,
  ReceivableStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { FinancialReportQuery } from '../schemas/finance.schema.js';
import type { AuditLogger } from './audit.service.js';
import { adjustedTitleAmount, money, nextRecurrenceDate } from './financial-rules.js';

type Bucket = { plannedIn: Prisma.Decimal; plannedOut: Prisma.Decimal; realizedIn: Prisma.Decimal; realizedOut: Prisma.Decimal };

function endExclusive(date: Date) { return new Date(date.getTime() + 86_400_000); }
function groupKey(date: Date, groupBy: FinancialReportQuery['groupBy']) {
  if (groupBy === 'day') return date.toISOString().slice(0, 10);
  if (groupBy === 'week') {
    const day = date.getUTCDay() || 7; const monday = new Date(date.getTime() - (day - 1) * 86_400_000);
    return monday.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 7);
}
function decimalSum(values: Prisma.Decimal[]) { return values.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)); }
function allocationFactor(allocations: Array<{ costCenterId: string; percentage: Prisma.Decimal }>, costCenterId?: string) {
  if (!costCenterId) return new Prisma.Decimal(1);
  return decimalSum(allocations.filter((item) => item.costCenterId === costCenterId).map((item) => item.percentage)).div(100);
}

const DRE_LABELS: Record<ChartAccountNature, string> = {
  REVENUE: 'Receita Bruta', DEDUCTION: 'Deduções', COST: 'Custos', EXPENSE: 'Despesas Operacionais',
  FINANCIAL_REVENUE: 'Receitas Financeiras', FINANCIAL_EXPENSE: 'Despesas Financeiras', INCOME_TAX: 'Tributos sobre o Lucro',
  ASSET: 'Fora da DRE', LIABILITY: 'Fora da DRE', EQUITY: 'Fora da DRE', NONE: 'Sem classificação gerencial',
};

export class FinanceReportService {
  constructor(private readonly audit: AuditLogger) {}

  private async drePeriod(query: FinancialReportQuery) {
    const range = { gte: query.from, lt: endExclusive(query.to) };
    const [payables, receivables, unclassifiedPayables, unclassifiedReceivables, cogsEntries] = await Promise.all([
      prisma.payable.findMany({ where: { competenceDate: range, status: { notIn: [PayableStatus.DRAFT, PayableStatus.CANCELLED] }, chartAccountId: query.chartAccountId ?? { not: null } },
        include: { chartAccount: true, allocations: true } }),
      prisma.receivable.findMany({ where: { competenceDate: range, status: { notIn: [ReceivableStatus.DRAFT, ReceivableStatus.CANCELLED] }, chartAccountId: query.chartAccountId ?? { not: null } },
        include: { chartAccount: true, allocations: true } }),
      prisma.payable.findMany({ where: { competenceDate: range, status: { notIn: [PayableStatus.DRAFT, PayableStatus.CANCELLED] }, chartAccountId: null }, select: { id: true, number: true, originalAmount: true } }),
      prisma.receivable.findMany({ where: { competenceDate: range, status: { notIn: [ReceivableStatus.DRAFT, ReceivableStatus.CANCELLED] }, chartAccountId: null }, select: { id: true, number: true, originalAmount: true } }),
      query.chartAccountId || query.costCenterId ? Promise.resolve([]) : prisma.cogsEntry.findMany({ where: { competenceDate: range }, orderBy: { competenceDate: 'asc' }, include: { order: { select: { number: true } }, product: { select: { sku: true, name: true } } } }),
    ]);
    const groups = new Map<ChartAccountNature, { amount: Prisma.Decimal; accounts: Map<string, { code: string; name: string; amount: Prisma.Decimal; entries: unknown[] }> }>();
    const add = (record: typeof payables[number] | typeof receivables[number], type: 'PAYABLE' | 'RECEIVABLE') => {
      if (!record.chartAccount) return;
      const factor = allocationFactor(record.allocations, query.costCenterId); if (factor.eq(0)) return;
      const amount = money(adjustedTitleAmount(record).mul(factor)); const nature = record.chartAccount.nature;
      const group = groups.get(nature) ?? { amount: new Prisma.Decimal(0), accounts: new Map() };
      group.amount = group.amount.add(amount);
      const account = group.accounts.get(record.chartAccount.id) ?? { code: record.chartAccount.code, name: record.chartAccount.name, amount: new Prisma.Decimal(0), entries: [] };
      account.amount = account.amount.add(amount); account.entries.push({ id: record.id, number: record.number, description: record.description,
        type, competenceDate: record.competenceDate, amount: amount.toFixed(2), origin: record.origin });
      group.accounts.set(record.chartAccount.id, account); groups.set(nature, group);
    };
    payables.forEach((item) => add(item, 'PAYABLE')); receivables.forEach((item) => add(item, 'RECEIVABLE'));
    if (cogsEntries.length) {
      const nature = ChartAccountNature.COST; const group = groups.get(nature) ?? { amount: new Prisma.Decimal(0), accounts: new Map() };
      const accountId = 'system:cogs'; const account = group.accounts.get(accountId) ?? { code: 'CMV', name: 'Custo das mercadorias vendidas', amount: new Prisma.Decimal(0), entries: [] };
      for (const entry of cogsEntries) {
        const amount = entry.type === 'REVERSAL' ? entry.amount.negated() : entry.amount;
        group.amount = group.amount.add(amount); account.amount = account.amount.add(amount);
        account.entries.push({ id: entry.id, number: entry.order.number, description: `${entry.type === 'REVERSAL' ? 'Estorno de CMV' : 'CMV'} · ${entry.product.sku} · ${entry.product.name}`, type: 'COGS', competenceDate: entry.competenceDate, amount: amount.toFixed(2), origin: 'STOCK' });
      }
      group.accounts.set(accountId, account); groups.set(nature, group);
    }
    const value = (nature: ChartAccountNature) => groups.get(nature)?.amount ?? new Prisma.Decimal(0);
    const grossRevenue = value(ChartAccountNature.REVENUE); const deductions = value(ChartAccountNature.DEDUCTION);
    const netRevenue = grossRevenue.sub(deductions); const costs = value(ChartAccountNature.COST); const grossProfit = netRevenue.sub(costs);
    const operatingExpenses = value(ChartAccountNature.EXPENSE); const operatingResult = grossProfit.sub(operatingExpenses);
    const financialRevenue = value(ChartAccountNature.FINANCIAL_REVENUE); const financialExpense = value(ChartAccountNature.FINANCIAL_EXPENSE);
    const financialResult = financialRevenue.sub(financialExpense); const beforeTax = operatingResult.add(financialResult);
    const incomeTax = value(ChartAccountNature.INCOME_TAX); const netResult = beforeTax.sub(incomeTax);
    const sections = Array.from(groups.entries()).map(([nature, group]) => ({ nature, label: DRE_LABELS[nature], amount: group.amount.toFixed(2),
      accounts: Array.from(group.accounts.values()).map((account) => ({ ...account, amount: account.amount.toFixed(2) })) }));
    return { period: { from: query.from.toISOString().slice(0, 10), to: query.to.toISOString().slice(0, 10) }, managerialNotice: 'DRE gerencial por competência; não substitui escrituração ou demonstração contábil oficial.',
      totals: { grossRevenue: grossRevenue.toFixed(2), deductions: deductions.toFixed(2), netRevenue: netRevenue.toFixed(2), costs: costs.toFixed(2), grossProfit: grossProfit.toFixed(2),
        operatingExpenses: operatingExpenses.toFixed(2), operatingResult: operatingResult.toFixed(2), financialRevenue: financialRevenue.toFixed(2), financialExpense: financialExpense.toFixed(2),
        financialResult: financialResult.toFixed(2), resultBeforeIncomeTax: beforeTax.toFixed(2), incomeTax: incomeTax.toFixed(2), netResult: netResult.toFixed(2) }, sections,
      reviewRequired: { payables: unclassifiedPayables, receivables: unclassifiedReceivables,
        amount: decimalSum([...unclassifiedPayables, ...unclassifiedReceivables].map((item) => item.originalAmount)).toFixed(2) } };
  }

  async dre(query: FinancialReportQuery) {
    const current = await this.drePeriod(query);
    const duration = query.to.getTime() - query.from.getTime() + 86_400_000;
    const previousTo = new Date(query.from.getTime() - 86_400_000); const previousFrom = new Date(previousTo.getTime() - duration + 86_400_000);
    const previous = await this.drePeriod({ ...query, from: previousFrom, to: previousTo });
    return { ...current, comparison: { period: previous.period, totals: previous.totals,
      netResultDifference: money(new Prisma.Decimal(current.totals.netResult).sub(previous.totals.netResult)).toFixed(2) } };
  }

  async cashFlow(query: FinancialReportQuery) {
    const range = { gte: query.from, lt: endExclusive(query.to) };
    const payableWhere: Prisma.PayableWhereInput = { dueDate: range, status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] },
      ...(query.chartAccountId ? { chartAccountId: query.chartAccountId } : {}), ...(query.bankAccountId ? { plannedBankAccountId: query.bankAccountId } : {}),
      ...(query.costCenterId ? { allocations: { some: { costCenterId: query.costCenterId } } } : {}) };
    const receivableWhere: Prisma.ReceivableWhereInput = { dueDate: range, status: { in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED] },
      ...(query.chartAccountId ? { chartAccountId: query.chartAccountId } : {}), ...(query.bankAccountId ? { plannedBankAccountId: query.bankAccountId } : {}),
      ...(query.costCenterId ? { allocations: { some: { costCenterId: query.costCenterId } } } : {}) };
    const movementWhere: Prisma.BankMovementWhereInput = { postedAt: range, reversedAt: null, ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}) };
    const [payables, receivables, movements, accounts, previousMovements, recurrences, overduePayables, overdueReceivables] = await Promise.all([
      prisma.payable.findMany({ where: payableWhere, include: { allocations: true, chartAccount: true } }),
      prisma.receivable.findMany({ where: receivableWhere, include: { allocations: true, chartAccount: true } }),
      prisma.bankMovement.findMany({ where: movementWhere, orderBy: { postedAt: 'asc' }, include: { bankAccount: { select: { id: true, name: true } } } }),
      prisma.bankAccount.findMany({ where: { ...(query.bankAccountId ? { id: query.bankAccountId } : {}), active: true } }),
      prisma.bankMovement.findMany({ where: { postedAt: { lt: query.from }, reversedAt: null, ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}) }, select: { amount: true, nature: true } }),
      prisma.financialRecurrence.findMany({ where: { status: FinancialRecurrenceStatus.ACTIVE, nextOccurrence: { lte: query.to },
        ...(query.chartAccountId ? { chartAccountId: query.chartAccountId } : {}), ...(query.costCenterId ? { costCenterId: query.costCenterId } : {}),
        ...(query.bankAccountId ? { plannedBankAccountId: query.bankAccountId } : {}) } }),
      prisma.payable.findMany({ where: { status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] }, dueDate: { lt: query.from } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true } }),
      prisma.receivable.findMany({ where: { status: { in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED] }, dueDate: { lt: query.from } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, receivedAmount: true } }),
    ]);
    const buckets = new Map<string, Bucket>();
    const bucket = (date: Date) => { const key = groupKey(date, query.groupBy); const value = buckets.get(key) ?? { plannedIn: new Prisma.Decimal(0), plannedOut: new Prisma.Decimal(0), realizedIn: new Prisma.Decimal(0), realizedOut: new Prisma.Decimal(0) }; buckets.set(key, value); return value; };
    const plannedDetails: unknown[] = [];
    for (const item of payables) { const factor = allocationFactor(item.allocations, query.costCenterId); const amount = money(adjustedTitleAmount(item).sub(item.paidAmount).mul(factor)); bucket(item.dueDate).plannedOut = bucket(item.dueDate).plannedOut.add(amount); plannedDetails.push({ type: 'PAYABLE', id: item.id, number: item.number, date: item.dueDate, amount: amount.toFixed(2), origin: item.origin }); }
    for (const item of receivables) { const factor = allocationFactor(item.allocations, query.costCenterId); const amount = money(adjustedTitleAmount(item).sub(item.receivedAmount).mul(factor)); bucket(item.dueDate).plannedIn = bucket(item.dueDate).plannedIn.add(amount); plannedDetails.push({ type: 'RECEIVABLE', id: item.id, number: item.number, date: item.dueDate, amount: amount.toFixed(2), origin: item.origin }); }
    for (const recurrence of recurrences) {
      let date = recurrence.nextOccurrence; let guard = 0;
      while (date < query.from && guard < 500) { date = nextRecurrenceDate(date, recurrence.frequency, recurrence.dueDay); guard += 1; }
      while (date <= query.to && (!recurrence.endDate || date <= recurrence.endDate) && guard < 500) {
        const target = bucket(date); if (recurrence.type === 'PAYABLE') target.plannedOut = target.plannedOut.add(recurrence.amount); else target.plannedIn = target.plannedIn.add(recurrence.amount);
        plannedDetails.push({ type: 'RECURRENCE', id: recurrence.id, date, amount: recurrence.amount.toFixed(2), direction: recurrence.type });
        date = nextRecurrenceDate(date, recurrence.frequency, recurrence.dueDay); guard += 1;
      }
    }
    for (const item of movements) {
      const target = bucket(item.postedAt); if (item.nature === BankMovementNature.CREDIT) target.realizedIn = target.realizedIn.add(item.amount); else target.realizedOut = target.realizedOut.add(item.amount);
    }
    const initialBalances = accounts.filter((account) => account.initialBalanceDate < endExclusive(query.from)).map((account) => account.initialBalance);
    const priorCredits = decimalSum(previousMovements.filter((item) => item.nature === BankMovementNature.CREDIT).map((item) => item.amount));
    const priorDebits = decimalSum(previousMovements.filter((item) => item.nature === BankMovementNature.DEBIT).map((item) => item.amount));
    const openingBalance = money(decimalSum(initialBalances).add(priorCredits).sub(priorDebits));
    let projectedBalance = openingBalance; let realizedBalance = openingBalance;
    const series = Array.from(buckets.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([period, value]) => {
      const plannedNet = value.plannedIn.sub(value.plannedOut); const realizedNet = value.realizedIn.sub(value.realizedOut);
      projectedBalance = projectedBalance.add(plannedNet); realizedBalance = realizedBalance.add(realizedNet);
      return { period, plannedIn: value.plannedIn.toFixed(2), plannedOut: value.plannedOut.toFixed(2), realizedIn: value.realizedIn.toFixed(2), realizedOut: value.realizedOut.toFixed(2),
        plannedNet: plannedNet.toFixed(2), realizedNet: realizedNet.toFixed(2), difference: realizedNet.sub(plannedNet).toFixed(2), projectedBalance: projectedBalance.toFixed(2), realizedBalance: realizedBalance.toFixed(2) };
    });
    const totals = series.reduce((acc, item) => ({ plannedIn: acc.plannedIn.add(item.plannedIn), plannedOut: acc.plannedOut.add(item.plannedOut), realizedIn: acc.realizedIn.add(item.realizedIn), realizedOut: acc.realizedOut.add(item.realizedOut) }),
      { plannedIn: new Prisma.Decimal(0), plannedOut: new Prisma.Decimal(0), realizedIn: new Prisma.Decimal(0), realizedOut: new Prisma.Decimal(0) });
    const overdueOut = decimalSum(overduePayables.map((item) => adjustedTitleAmount(item).sub(item.paidAmount)));
    const overdueIn = decimalSum(overdueReceivables.map((item) => adjustedTitleAmount(item).sub(item.receivedAmount)));
    return { period: { from: query.from.toISOString().slice(0, 10), to: query.to.toISOString().slice(0, 10), groupBy: query.groupBy }, openingBalance: openingBalance.toFixed(2),
      totals: { plannedIn: totals.plannedIn.toFixed(2), plannedOut: totals.plannedOut.toFixed(2), realizedIn: totals.realizedIn.toFixed(2), realizedOut: totals.realizedOut.toFixed(2),
        plannedNet: totals.plannedIn.sub(totals.plannedOut).toFixed(2), realizedNet: totals.realizedIn.sub(totals.realizedOut).toFixed(2),
        difference: totals.realizedIn.sub(totals.realizedOut).sub(totals.plannedIn.sub(totals.plannedOut)).toFixed(2), projectedBalance: projectedBalance.toFixed(2), realizedBalance: realizedBalance.toFixed(2),
        overdueIn: overdueIn.toFixed(2), overdueOut: overdueOut.toFixed(2) }, series, plannedDetails,
      realizedDetails: movements.map((item) => ({ id: item.id, number: item.number, date: item.postedAt, nature: item.nature, type: item.type, amount: item.amount.toFixed(2), bankAccount: item.bankAccount })) };
  }

  async dashboard(query: FinancialReportQuery) {
    const [dre, cash, pendingReconciliation] = await Promise.all([this.dre(query), this.cashFlow(query), prisma.bankTransaction.count({ where: { reconciliationStatus: { in: ['PENDING', 'SUGGESTED', 'DIVERGENT'] } } })]);
    const receivableOpen = await prisma.receivable.findMany({ where: { status: { in: [ReceivableStatus.PENDING, ReceivableStatus.PARTIALLY_RECEIVED] } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, receivedAmount: true, dueDate: true } });
    const payableOpen = await prisma.payable.findMany({ where: { status: { in: [PayableStatus.PENDING, PayableStatus.PARTIALLY_PAID] } }, select: { originalAmount: true, interestAmount: true, penaltyAmount: true, discountAmount: true, paidAmount: true, dueDate: true } });
    const today = new Date(); const openReceivable = decimalSum(receivableOpen.map((item) => adjustedTitleAmount(item).sub(item.receivedAmount))); const openPayable = decimalSum(payableOpen.map((item) => adjustedTitleAmount(item).sub(item.paidAmount)));
    return { generatedAt: new Date().toISOString(), metrics: { availableBalance: cash.totals.realizedBalance, receivableOpen: openReceivable.toFixed(2), payableOpen: openPayable.toFixed(2),
      overdueReceivable: decimalSum(receivableOpen.filter((item) => item.dueDate < today).map((item) => adjustedTitleAmount(item).sub(item.receivedAmount))).toFixed(2),
      overduePayable: decimalSum(payableOpen.filter((item) => item.dueDate < today).map((item) => adjustedTitleAmount(item).sub(item.paidAmount))).toFixed(2),
      managerialResult: dre.totals.netResult, plannedNet: cash.totals.plannedNet, realizedNet: cash.totals.realizedNet, pendingReconciliation }, dre, cash };
  }

  async snapshot(query: FinancialReportQuery, actor: string) {
    const cash = await this.cashFlow(query);
    const snapshot = await prisma.financialForecastSnapshot.create({ data: { snapshotDate: new Date(), periodStart: query.from, periodEnd: query.to,
      filters: { bankAccountId: query.bankAccountId ?? null, chartAccountId: query.chartAccountId ?? null, costCenterId: query.costCenterId ?? null, groupBy: query.groupBy },
      data: cash as unknown as Prisma.InputJsonValue, createdById: actor } });
    await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_SNAPSHOT, entityId: snapshot.id, action: AuditAction.SNAPSHOT, newData: { periodStart: query.from, periodEnd: query.to } });
    return snapshot;
  }

  listSnapshots() { return prisma.financialForecastSnapshot.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { createdBy: { select: { id: true, name: true } } } }); }
}
